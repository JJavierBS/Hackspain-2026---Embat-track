// client.ts — same-origin "/api": Vite proxies it in dev, nginx in Docker.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return (await res.json()) as T;
}

/** true for a network error (fetch throws a TypeError) or a 5xx: the server is down, not answering "no". */
export function isServerDown(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

/** Contract item 7: "/portfolio?profile=BANK&month=2026-08" -> "portfolio_month_2026-08_profile_BANK". Keep in sync with scripts/snapshot-fallback.mjs. */
export function fallbackKey(path: string): string {
  const [route, query = ""] = path.split("?");
  const params: [string, string][] = [];
  new URLSearchParams(query).forEach((value, name) => params.push([name, value]));
  params.sort(([a], [b]) => a.localeCompare(b));
  const flat = [route.replace(/^\//, ""), ...params.flat()].join("_");
  return flat.replace(/[^A-Za-z0-9_-]/g, "_");
}

// Offline flag (SPEC §14): set once a GET was answered from the frozen snapshot. Read with useSyncExternalStore.
let offline = false;
const listeners = new Set<() => void>();

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineSnapshot(): boolean {
  return offline;
}

function markOffline() {
  if (offline) return;
  offline = true;
  for (const l of listeners) l();
}

/**
 * The snapshot file for a path, or null. nginx answers index.html for an unknown path (try_files),
 * so only an ok response with a JSON content type counts.
 */
async function readFallback<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`/fallback/${fallbackKey(path)}.json`);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET with the static fallback: on a network error or a 5xx, read the frozen snapshot. A 4xx is an answer, never a fallback. */
export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`);
  } catch (error) {
    const frozen = await readFallback<T>(path);
    if (frozen === null) throw error;
    markOffline();
    return frozen;
  }
  if (res.status >= 500) {
    const frozen = await readFallback<T>(path);
    if (frozen !== null) {
      markOffline();
      return frozen;
    }
  }
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
