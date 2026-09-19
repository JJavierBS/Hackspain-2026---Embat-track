import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:5173";
const pause = ms => new Promise(ok => setTimeout(ok, ms));
async function until(fn) {
  const end = Date.now() + 60000;
  while (Date.now() < end) { try { const result = await fn(); if (result) return result; } catch {} await pause(250); }
  throw new Error("La aplicación no respondió como se esperaba durante la prueba.");
}
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, path);
  return response.json();
}

await until(async () => (await fetch(base + "/api/meta")).ok);
assert.equal((await get("/api/config")).appliedToData, true);
const checked = [];
for (const id of ["GROUP_0039", "GROUP_0101"]) {
  for (const profile of ["BANK", "FUND", "INSURER"]) {
    for (const month of ["2026-07", "2026-08"]) {
      const path = `/api/entities/${id}?profile=${profile}&month=${month}`;
      const start = performance.now();
      const detail = await get(path);
      const s = detail.suggestions;
      assert.equal(s.mode, "atencion");
      assert.ok(["READY", "NO_EVIDENCE"].includes(s.state));
      assert.ok(s.items.length <= 3);
      assert.equal(new Set(s.items.map(i => i.id)).size, s.items.length);
      for (const item of s.items) {
        const i = detail.indicators.find(i => i.indicatorId === item.evidence.indicatorId);
        assert.ok(i?.available);
        assert.equal(i.value, item.evidence.value);
        assert.equal(item.evidence.month, month);
        assert.equal(item.impactoCalculado, null);
        assert.ok(item.text.split(/\s+/u).length <= 25);
        assert.deepEqual(item.refs, [item.evidence.ref]);
      }
      assert.deepEqual((await get(path)).suggestions, s);
      checked.push({ id, profile, month, score: detail.row.final, suggestions: s.items.map(i => i.id),
        milliseconds: Math.round(performance.now() - start) });
    }
  }
}
assert.notDeepEqual(checked[0].suggestions, checked[6].suggestions);
console.log(JSON.stringify({ api: "OK", cases: checked }, null, 2));

if (process.env.CHROME_PATH) {
  const output = join(root, "data", "browser-test");
  await mkdir(output, { recursive: true });
  const chromeEnv = { ...process.env };
  delete chromeEnv.HELMCODE_API_KEY;
  const chrome = spawn(process.env.CHROME_PATH, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9333", `--user-data-dir=${output}`, "about:blank"],
    { stdio: "ignore", env: chromeEnv });
  let socket;
  try {
    const tab = await until(async () => {
      const response = await fetch("http://127.0.0.1:9333/json");
      return (await response.json()).find(t => t.type === "page");
    });
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fail, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    const network = [];
    socket.addEventListener("message", event => {
      const data = JSON.parse(event.data);
      if (data.id) { const job = pending.get(data.id); pending.delete(data.id); if (data.error) job?.fail(new Error(data.error.message)); else job?.ok(data.result); }
      if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.text);
      if (data.method === "Network.requestWillBeSent") network.push(data.params.request.url);
    });
    const call = (method, params = {}) => new Promise((ok, fail) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP: ${method} no responde`)); }, 15000);
      pending.set(id, { ok: value => { clearTimeout(timer); ok(value); }, fail: error => { clearTimeout(timer); fail(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => (await call("Runtime.evaluate", { expression, returnByValue: true })).result.value;
    await call("Runtime.enable"); await call("Network.enable"); await call("Page.enable");
    for (const id of ["GROUP_0039", "GROUP_0101"]) {
      await call("Page.navigate", { url: `${base}/entity/${id}?profile=BANK&month=2026-07` });
      await until(async () => (await evaluate("document.querySelector('#sugerencias')?.innerText || ''")).includes("Revisa"));
      assert.match(await evaluate("document.querySelector('#sugerencias').innerText"), /Texto de plantilla verificada/);
      await evaluate("document.querySelector('#sugerencias summary').click()");
      assert.equal(await evaluate("document.querySelector('#sugerencias details').open"), true);
      assert.equal(await evaluate("document.querySelector('#indicadores') !== null"), true);
    }
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await evaluate("document.querySelector('#sugerencias').scrollIntoView()");
    const image = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(root, "data", "s7-mobile.png"), Buffer.from(image.data, "base64"));
    assert.deepEqual(errors, []);
    assert.equal(network.some(url => url.includes("helmcode")), false);
    console.log("Navegador: dos fichas, evidencia desplegable, móvil sin desbordamiento, cero excepciones y cero llamadas a Helmcode.");
  } finally {
    socket?.close();
    chrome.kill();
  }
} else {
  console.log("Navegador no ejecutado: define CHROME_PATH para probar también la interfaz con Chrome aislado.");
}
