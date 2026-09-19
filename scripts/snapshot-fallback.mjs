#!/usr/bin/env node
// Freezes the GET answers of a running backend into frontend/public/fallback (SPEC §14, decision G12).
// The frontend reads them when the backend is down. Node 24, no dependency.
//
//   node scripts/snapshot-fallback.mjs --api http://localhost:8080 --out frontend/public/fallback
//
// Exits non-zero when any fetch fails, so a partial snapshot is never committed by accident.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:8080" },
    out: { type: "string", default: "frontend/public/fallback" },
  },
});
const api = values.api.replace(/\/$/, "");
const out = values.out;

/** Contract item 7. Keep in sync with fallbackKey in frontend/src/api/client.ts. */
function fallbackKey(path) {
  const [route, query = ""] = path.split("?");
  const params = [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b));
  const flat = [route.replace(/^\//, ""), ...params.flat()].join("_");
  return flat.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Keep in sync with DEFAULT_HORIZON in frontend/src/hooks/useHorizon.ts. */
const DEFAULT_HORIZON = 3;

const failures = [];
const written = [];
let total = 0;

/** Fetches one GET path, writes it under its key and returns the parsed JSON (null on failure). */
async function snap(path) {
  const key = fallbackKey(path);
  if (written.includes(key)) return null;
  try {
    const res = await fetch(`${api}/api${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    await writeFile(join(out, `${key}.json`), text);
    written.push(key);
    total += Buffer.byteLength(text);
    console.log(`${String(Buffer.byteLength(text)).padStart(10)} B  ${key}.json`);
    return json;
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    console.error(`    FAILED  ${path}: ${error.message}`);
    return null;
  }
}

await mkdir(out, { recursive: true });

const meta = await snap("/meta");
if (!meta) {
  console.error(`No /api/meta at ${api}. Is the backend running?`);
  process.exit(1);
}
const month = meta.months.at(-1);
const profiles = meta.profiles;
await snap("/profiles");
await snap("/methodology");

for (const profile of profiles) {
  const q = `profile=${profile}&month=${month}`;
  await snap(`/portfolio?${q}`);
  const lead = await snap(`/analytics/lead-time?profile=${profile}`);
  const pairs = await snap(`/analytics/showcase-pairs?${q}`);
  await snap(`/analytics/distribution?${q}`);
  await snap(`/monitor/alerts?${q}`);
  await snap(`/monitor/watchlist?${q}`);

  // The showcase entities: both sides of the first three pairs, then the first five lead-time examples.
  const ids = new Set();
  for (const p of pairs?.pairs.slice(0, 3) ?? []) ids.add(p.up.id).add(p.down.id);
  for (const e of lead?.examples.slice(0, 5) ?? []) ids.add(e.entityId);
  // The entity page asks for the projection with its default horizon (DEFAULT_HORIZON in useHorizon.ts, phase 7).
  for (const id of ids) {
    await snap(`/entities/${id}?${q}&horizon=${DEFAULT_HORIZON}`);
    await snap(`/entities/${id}/timeline?profile=${profile}`);
  }
}

const index = { month, createdAt: new Date().toISOString(), keys: written };
await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2));
console.log(`${written.length} files, ${(total / 1024).toFixed(0)} KiB, month ${month} -> ${out}`);

if (failures.length > 0) {
  console.error(`${failures.length} fetches failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
