import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnvironment, hasSuggestionsModule, localSettings, saveLocalKey, suggestionExamplePath } from "./local-settings.mjs";

async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "s7-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("defaults allow templates without a credential", async t => {
  const settings = await localSettings(await temporary(t), {});
  assert.equal(settings.HELMCODE_MODEL, "glm5.3");
  assert.equal(settings.S7_MONTH, "2026-07");
  assert.equal(settings.S7_ENTITY_IDS, "GROUP_0039,GROUP_0101");
  assert.equal(settings.HELMCODE_API_KEY, undefined);
  assert.equal(settings.S7_BACKEND_PORT, "8081");
  assert.equal(settings.S7_FRONTEND_PORT, "5174");
});

test("private file loads only allowed settings and explicit environment wins", async t => {
  const dir = await temporary(t);
  await writeFile(join(dir, ".env.local"), 'HELMCODE_API_KEY="test-credential"\nHELMCODE_MODEL=deepseek-v4-flash\nVITE_SECRET=ignored\nNODE_OPTIONS=ignored\n');
  const settings = await localSettings(dir, { HELMCODE_MODEL: "glm5.3" });
  assert.equal(settings.HELMCODE_API_KEY, "test-credential");
  assert.equal(settings.HELMCODE_MODEL, "glm5.3");
  assert.equal(settings.VITE_SECRET, undefined);
  assert.equal(settings.NODE_OPTIONS, undefined);
});

test("credential is saved locally once without overwriting configuration", async t => {
  const dir = await temporary(t);
  await saveLocalKey(dir, "test-credential");
  assert.equal((await localSettings(dir, {})).HELMCODE_API_KEY, "test-credential");
  await assert.rejects(saveLocalKey(dir, "replacement-credential"), /ya existe/);
  assert.equal((await localSettings(dir, {})).HELMCODE_API_KEY, "test-credential");
  assert.equal((await readFile(join(dir, ".env.local"), "utf8")).includes("replacement"), false);
});

test("missing or multiline credentials fail without echoing the input", async t => {
  const dir = await temporary(t);
  await assert.rejects(saveLocalKey(dir, ""), /Falta/);
  await assert.rejects(saveLocalKey(dir, "private-value\nINJECTED=1"), error => !error.message.includes("private-value"));
});

test("local ports are configurable and invalid or identical ports are rejected", async t => {
  const dir = await temporary(t);
  const settings = await localSettings(dir, { S7_BACKEND_PORT: "8181", S7_FRONTEND_PORT: "5274" });
  assert.equal(settings.S7_BACKEND_PORT, "8181");
  assert.equal(settings.S7_FRONTEND_PORT, "5274");
  for (const port of ["0", "65536", "invalid", "5174"]) {
    await assert.rejects(localSettings(dir, { S7_BACKEND_PORT: port }), /puertos/i);
  }
});

test("startup rejects a backend without the S7 response contract", () => {
  assert.equal(hasSuggestionsModule({ id: "GROUP_0039", row: {} }), false);
  assert.equal(hasSuggestionsModule(null), false);
  assert.equal(hasSuggestionsModule({ suggestions: { v: "suggestions.v3", mode: "atencion", items: [] } }), true);
});

test("example URL uses the configured company and month without exposing credentials", () => {
  assert.equal(suggestionExamplePath({ S7_ENTITY_IDS: "GROUP_0039,GROUP_0101", S7_MONTH: "2026-07", HELMCODE_API_KEY: "test-secret" }),
    "/entity/GROUP_0039?profile=BANK&month=2026-07#sugerencias");
  assert.equal(suggestionExamplePath({ S7_ENTITY_IDS: "COMP_0100", S7_MONTH: "2026-08" }),
    "/entity/COMP_0100?profile=BANK&month=2026-08#sugerencias");
  assert.equal(suggestionExamplePath({ S7_ENTITY_IDS: "test-secret", S7_MONTH: "2026-07" }), null);
  assert.equal(suggestionExamplePath({ S7_ENTITY_IDS: "GROUP_0039", S7_MONTH: "not-a-month" }), null);
});

test("only the explicit preparation process receives the credential", () => {
  const parent = { HELMCODE_API_KEY: "test-credential", HELMCODE_MODEL: "glm5.3", PATH: "test-path" };
  assert.equal(childEnvironment(parent).HELMCODE_API_KEY, undefined);
  assert.equal(childEnvironment(parent, {}, true).HELMCODE_API_KEY, "test-credential");
  assert.equal(childEnvironment(parent).HELMCODE_MODEL, "glm5.3");
  assert.equal(parent.HELMCODE_API_KEY, "test-credential");
});
