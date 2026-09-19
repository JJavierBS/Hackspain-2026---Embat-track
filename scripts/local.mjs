import { spawn } from "node:child_process";
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import net from "node:net";
import { childEnvironment, localSettings, saveLocalKey } from "./local-settings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const command = process.argv[2] ?? "help";
const settings = await localSettings(root);
const env = { ...process.env, ...settings, XRAY_DATA_DIR: join(root, "data"), XRAY_DEMO_MODE: "true", SERVER_ADDRESS: "127.0.0.1",
  SERVER_PORT: "8080", PORT: "8080", MAVEN_USER_HOME: join(root, ".local-maven"),
  npm_config_cache: join(root, ".local-npm"), VITE_API_TARGET: "http://127.0.0.1:8080", VITE_MOCKS: "false" };
const jar = join(root, "backend", "target", "xray-backend-0.0.1-SNAPSHOT.jar");
const npm = windows ? join(dirname(process.execPath), "npm.cmd") : "npm";
const mvn = join(root, "backend", windows ? "mvnw.cmd" : "mvnw");

if (!env.JAVA_HOME && windows) {
  const base = join(process.env.ProgramFiles ?? "C:/Program Files", "Eclipse Adoptium");
  if (existsSync(base)) {
    const candidates = (await readdir(base)).filter(n => n.startsWith("jdk-21.")).sort().reverse();
    if (candidates.length) env.JAVA_HOME = join(base, candidates[0]);
  }
}
const java = env.JAVA_HOME ? join(env.JAVA_HOME, "bin", windows ? "java.exe" : "java") : "java";

function start(executable, args, cwd, extraEnv = {}, withKey = false) {
  const childEnv = childEnvironment(env, extraEnv, withKey);
  const isBatch = windows && /\.(cmd|bat)$/i.test(executable);
  const child = isBatch
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${[executable, ...args].map(a => `"${a}"`).join(" ")}"`],
        { cwd, env: childEnv, stdio: "inherit", windowsHide: true, windowsVerbatimArguments: true })
    : spawn(executable, args, { cwd, env: childEnv, stdio: "inherit" });
  child.on("error", () => console.error(`No se puede ejecutar ${executable}. Comprueba Java 21 y Node.js.`));
  return child;
}

async function run(executable, args, cwd = root, extraEnv = {}, withKey = false) {
  const child = start(executable, args, cwd, extraEnv, withKey);
  await new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("exit", code => code === 0 ? ok() : fail(new Error(`El comando terminó con código ${code}.`)));
  });
}

async function initialize() {
  await mkdir(env.XRAY_DATA_DIR, { recursive: true });
  const database = join(env.XRAY_DATA_DIR, "xray.duckdb");
  if (!existsSync(database)) {
    const temp = `${database}.${process.pid}.tmp`;
    try {
      await pipeline(createReadStream(join(root, "backend", "demo", "xray-demo.duckdb.gz")), createGunzip(),
        createWriteStream(temp, { flags: "wx" }));
      await rename(temp, database);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }
}

async function freePort(port) {
  await new Promise((ok, fail) => {
    const server = net.createServer();
    server.once("error", () => fail(new Error(`El puerto ${port} está ocupado. Detén la instancia local anterior.`)));
    server.listen(port, "127.0.0.1", () => server.close(ok));
  });
}

async function prepare(llm = false) {
  if (!existsSync(jar)) throw new Error("Primero ejecuta: node scripts/local.mjs setup");
  await freePort(8080);
  await initialize();
  if (llm && !env.HELMCODE_API_KEY) throw new Error("Falta HELMCODE_API_KEY. Usa Preparar-IA.ps1 o una variable de entorno privada.");
  await run(java, ["-Xmx1024m", "-jar", jar, "--spring.main.web-application-type=none", "--xray.suggestions.prepare=true"],
    root, { HELMCODE_ENABLE: String(llm) }, llm);
}

try {
  if (command === "configure-ia") {
    await saveLocalKey(root, env.HELMCODE_API_KEY, env.HELMCODE_MODEL);
    console.log("Clave guardada solo en .env.local, excluido de Git. El arranque preparará la IA antes de abrir la web.");
  } else if (command === "setup") {
    await run(process.execPath, ["--test", join(root, "scripts", "local-settings.test.mjs")]);
    await freePort(8080);
    await freePort(5173);
    await run(java, ["-version"]);
    await run(mvn, ["-B", `-Dmaven.repo.local=${join(root, ".local-maven", "repository")}`, "package"], join(root, "backend"));
    await run(npm, ["ci", "--no-audit", "--no-fund"], join(root, "frontend"));
    await run(npm, ["run", "build"], join(root, "frontend"));
    await prepare();
    console.log("Preparado sin consumir tokens. Ejecuta: node scripts/local.mjs start");
  } else if (command === "prepare" || command === "prepare-ia") {
    await prepare(command === "prepare-ia");
  } else if (command === "start" || command === "start-offline") {
    await freePort(5173);
    const useAI = command === "start" && Boolean(env.HELMCODE_API_KEY);
    console.log(useAI ? "Preparando Helmcode para los casos seleccionados; se reutilizan respuestas válidas en caché."
      : "Arranque sin llamadas a Helmcode. Se muestran sugerencias guardadas o plantillas.");
    await prepare(useAI);
    const backend = start(java, ["-Xmx1024m", "-jar", jar], root, { HELMCODE_ENABLE: "false" });
    let frontend;
    let stopping = false;
    function stop() {
      if (stopping) return;
      stopping = true;
      backend.kill(); frontend?.kill();
    }
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    backend.on("exit", stop);
    let ready = false;
    for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
      try {
        const health = await fetch("http://127.0.0.1:8080/actuator/health", { signal: AbortSignal.timeout(1000) });
        if (health.ok) { ready = true; break; }
      } catch {}
      await new Promise(ok => setTimeout(ok, 250));
    }
    if (!ready) { stop(); throw new Error("El backend no ha arrancado. Revisa el error anterior."); }
    frontend = start(process.execPath, [join(root, "frontend", "node_modules", "vite", "bin", "vite.js"),
      "--host", "127.0.0.1", "--port", "5173", "--strictPort"], join(root, "frontend"), { HELMCODE_ENABLE: "false" });
    frontend.on("exit", stop);
    console.log("Abre http://127.0.0.1:5173 · Ctrl+C detiene ambos procesos. No hay llamadas a Helmcode durante la navegación.");
  } else {
    console.log("Uso: node scripts/local.mjs setup | start | start-offline | configure-ia | prepare | prepare-ia\nJava 21 y Node.js 24. setup no consume tokens. start prepara IA si hay clave local; start-offline nunca llama al proveedor. configure-ia guarda HELMCODE_API_KEY en .env.local sin sobrescribir archivos.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
