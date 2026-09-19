import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localSettings } from "./local-settings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = `http://127.0.0.1:${(await localSettings(root)).S7_FRONTEND_PORT}`;
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
      assert.ok(["READY", "NO_EVIDENCE", "PROVIDER_UNAVAILABLE", "INVALID_RESPONSE", "MISSING_KEY", "INVALID_MODEL"].includes(s.state));
      assert.ok(["template", "helmcode"].includes(s.source));
      if (process.env.S7_EXPECT_HELMCODE === "true" && month === "2026-07") {
        assert.equal(s.source, "helmcode", `Falta respuesta real aceptada: ${id}/${profile}/${month}`);
        assert.equal(s.state, "READY");
      }
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
      checked.push({ id, profile, month, score: detail.row.final, source: s.source, suggestions: s.items.map(i => i.id),
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
    await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: base });
    await until(async () => await evaluate("Array.from(document.querySelectorAll('a[href^=\"/entity/\"]')).some(a => a.getClientRects().length > 0)"));
    await evaluate("(() => { const link = Array.from(document.querySelectorAll('a[href^=\"/entity/\"]')).find(a => a.getClientRects().length > 0); link.scrollIntoView({block: 'center'}); link.click(); })()");
    await until(async () => await evaluate("location.pathname.startsWith('/entity/') && document.querySelector('#indicadores') !== null"));
    await evaluate("Array.from(document.querySelectorAll('a')).find(a => new URL(a.href).origin === location.origin && new URL(a.href).pathname === '/').click()");
    await until(async () => await evaluate("location.pathname === '/' && document.querySelector('#sugerencias') === null && document.querySelector('main h1')?.textContent === 'Cartera' && Array.from(document.querySelectorAll('a[href^=\"/entity/\"]')).some(a => a.getClientRects().length > 0)"));
    await evaluate("(() => { const link = Array.from(document.querySelectorAll('a[href^=\"/entity/\"]')).find(a => a.getClientRects().length > 0); link.scrollIntoView({block: 'center'}); link.click(); })()");
    await until(async () => await evaluate("location.pathname.startsWith('/entity/') && document.querySelector('#indicadores') !== null"));
    const entry = await evaluate("({url: location.pathname + location.search, title: document.querySelector('#sugerencias h2')?.textContent, top: document.querySelector('#sugerencias')?.getBoundingClientRect().top, viewport: innerHeight, sectionOrder: Array.from(document.querySelectorAll('main section h2')).map(h => h.textContent)})");
    console.log("Entrada desde cartera:", JSON.stringify(entry));
    const noScore = await get("/api/entities/GROUP_0039?profile=BANK&month=2024-09");
    assert.equal(noScore.row, null);
    await call("Page.navigate", { url: `${base}/entity/GROUP_0039?profile=BANK&month=2024-09` });
    await until(async () => await evaluate("document.querySelector('main')?.innerText.includes('Sin puntuación')"));
    const noScorePanel = await evaluate("document.querySelector('#sugerencias')?.innerText ?? null");
    console.log("Ficha sin puntuación, panel presente:", noScorePanel !== null);
    assert.notEqual(noScorePanel, null, "La ficha sin puntuación debe conservar la sección de insights y explicar su ausencia de datos");
    assert.match(noScorePanel, /no hay puntuación/i);
    assert.equal(entry.title, "Insights y recomendaciones");
    assert.ok(entry.url.includes("month=2026-08"), "La navegación de prueba debe conservar el mes predeterminado de cartera");
    assert.ok(entry.top >= 0 && entry.top < entry.viewport, "Los insights deben ser visibles al entrar, sin heredar el scroll de cartera ni quedar detrás de la gráfica");
    assert.ok(entry.sectionOrder.indexOf("Insights y recomendaciones") < entry.sectionOrder.indexOf("Radiografía"));
    const noEvidence = await get("/api/entities/GROUP_0101?profile=BANK&month=2024-09");
    assert.equal(noEvidence.suggestions.state, "NO_EVIDENCE");
    await call("Page.navigate", { url: `${base}/entity/GROUP_0101?profile=BANK&month=2024-09` });
    await until(async () => await evaluate("document.querySelector('#indicadores') !== null"));
    assert.match(await evaluate("document.querySelector('#sugerencias').innerText"), /No hay señales suficientes/);
    assert.equal(await evaluate("document.querySelectorAll('#sugerencias li').length"), 0);
    await call("Page.navigate", { url: `${base}/entity/GROUP_0039?profile=BANK&month=2026-08` });
    await until(async () => await evaluate("document.querySelector('#sugerencias')?.innerText.includes('Texto de plantilla verificada')"));
    assert.match(await evaluate("document.querySelector('#sugerencias').innerText"), /No hay una respuesta de IA validada/);
    const example = await evaluate("document.querySelector('#sugerencias a[href^=\"/entity/\"]')?.getAttribute('href')");
    assert.equal(example, "/entity/GROUP_0039?profile=BANK&month=2026-07#sugerencias");
    await evaluate("document.querySelector('#sugerencias a[href^=\"/entity/\"]').click()");
    await until(async () => await evaluate("location.search.includes('month=2026-07') && document.querySelector('#sugerencias') !== null"));
    for (const id of ["GROUP_0039", "GROUP_0101"]) {
      await call("Page.navigate", { url: `${base}/entity/${id}?profile=BANK&month=2026-07` });
      await until(async () => await evaluate("document.querySelectorAll('#sugerencias li').length > 0"));
      const source = checked.find(row => row.id === id && row.profile === "BANK" && row.month === "2026-07").source;
      assert.match(await evaluate("document.querySelector('#sugerencias').innerText"),
        source === "helmcode" ? /Formulación verificada con Helmcode/ : /Texto de plantilla verificada/);
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
    console.log("Navegador: entrada desde cartera, insights visibles, ficha sin puntuación, ausencia de señales, plantillas, enlace al caso IA, evidencia/móvil y cero llamadas a Helmcode al navegar.");
  } finally {
    socket?.close();
    chrome.kill();
  }
} else {
  console.log("Navegador no ejecutado: define CHROME_PATH para probar también la interfaz con Chrome aislado.");
}
