import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

const defaults = Object.freeze({ HELMCODE_MODEL: "glm5.3", S7_ENTITY_IDS: "GROUP_0039,GROUP_0101", S7_MONTH: "2026-07" });
const allowed = ["HELMCODE_API_KEY", "HELMCODE_MODEL", "S7_ENTITY_IDS", "S7_MONTH"];
const pick = source => Object.fromEntries(allowed.filter(key => source[key] !== undefined).map(key => [key, source[key]]));

export async function localSettings(root, parent = process.env) {
  let local = {};
  try {
    local = parseEnv(await readFile(join(root, ".env.local"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("No se puede leer .env.local. Comprueba su formato sin compartir la clave.");
  }
  const settings = { ...defaults, ...pick(local), ...pick(parent) };
  if (!["glm5.3", "deepseek-v4-flash"].includes(settings.HELMCODE_MODEL)) {
    throw new Error("Modelo no permitido. Usa glm5.3 o deepseek-v4-flash.");
  }
  return settings;
}

export async function saveLocalKey(root, key, model = defaults.HELMCODE_MODEL) {
  if (typeof key !== "string" || !key.trim()) throw new Error("Falta HELMCODE_API_KEY para guardar la configuración local.");
  if (/\s/u.test(key) || !["glm5.3", "deepseek-v4-flash"].includes(model)) {
    throw new Error("Configuración no válida; no se ha guardado ninguna clave.");
  }
  try {
    await writeFile(join(root, ".env.local"), `HELMCODE_API_KEY=${JSON.stringify(key)}\nHELMCODE_MODEL=${model}\n`,
      { flag: "wx", mode: 0o600 });
  } catch (error) {
    throw new Error(error.code === "EEXIST"
      ? ".env.local ya existe; no se ha sobrescrito. Edítalo localmente para cambiar la clave."
      : "No se puede guardar la configuración local; no compartas el contenido de la clave.");
  }
}

export function childEnvironment(base, extra = {}, withKey = false) {
  const env = { ...base, ...extra };
  if (!withKey) delete env.HELMCODE_API_KEY;
  return env;
}
