import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localSettings } from "./local-settings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("No se ha podido completar la comprobación de Git.");
  return result.stdout;
}
try {
  git(["check-ignore", ".env.local"]);
  if (git(["ls-files", "--", ".env.local"]).trim()) throw new Error("La configuración privada figura en el índice. No publicar.");
  const key = (await localSettings(root)).HELMCODE_API_KEY;
  if (key) {
    const staged = git(["diff", "--cached", "--no-ext-diff", "--binary"]);
    const committed = git(["show", "--format=", "--no-ext-diff", "HEAD"]);
    if (staged.includes(key) || committed.includes(key)) throw new Error("Se ha detectado la clave local en cambios Git. No publicar.");
  }
  console.log(key
    ? "OK: configuración privada ignorada y clave local ausente del diff preparado y del último commit."
    : "OK: configuración privada ignorada; no hay clave local que contrastar.");
} catch {
  console.error("La comprobación de privacidad no ha pasado. No publiques hasta revisar la configuración local.");
  process.exitCode = 1;
}
