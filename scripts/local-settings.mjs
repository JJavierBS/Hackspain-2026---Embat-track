import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

const defaults = Object.freeze({ HELMCODE_MODEL: "glm5.3", S7_ENTITY_IDS: "GROUP_0039,GROUP_0101", S7_MONTH: "2026-07",
  S7_BACKEND_PORT: "8081", S7_FRONTEND_PORT: "5174" });
const allowed = ["HELMCODE_API_KEY", ...Object.keys(defaults)];
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
  const ports = [settings.S7_BACKEND_PORT, settings.S7_FRONTEND_PORT];
  if (ports.some(port => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
      || Number(ports[0]) === Number(ports[1])) throw new Error("Los puertos S7 deben ser distintos y estar entre 1 y 65535.");
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

export function hasSuggestionsModule(detail) {
  return detail?.suggestions?.v === "suggestions.v3" && detail.suggestions.mode === "atencion"
    && Array.isArray(detail.suggestions.items);
}

export function suggestionExamplePath(settings) {
  const id = (settings.S7_ENTITY_IDS ?? "").split(",").map(value => value.trim())
    .find(value => /^(GROUP|COMP)_\d+$/.test(value));
  const month = settings.S7_MONTH ?? "";
  if (!id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  return `/entity/${id}?profile=BANK&month=${month}#sugerencias`;
}

export function childEnvironment(base, extra = {}, withKey = false) {
  const env = { ...base, ...extra };
  if (!withKey) delete env.HELMCODE_API_KEY;
  return env;
}
