import { useQuery } from "@tanstack/react-query";
import { useOffline } from "../api/queries";
import { monthCode, monthLong } from "../lib/format";

interface SnapshotIndex {
  month: string;
  createdAt: string;
  keys: string[];
}

/** The snapshot's own index; null when it is missing (the sentence then drops the month). */
async function readIndex(): Promise<SnapshotIndex | null> {
  try {
    const res = await fetch("/fallback/index.json");
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as SnapshotIndex;
  } catch {
    return null;
  }
}

/**
 * SPEC §14: the backend is down and the pages read a frozen snapshot. Static, and plain about it:
 * the jury must see that the numbers are a photo, not a live run.
 */
export function OfflineBanner() {
  const offline = useOffline();
  const { data: index } = useQuery({ queryKey: ["fallback-index"], queryFn: readIndex, enabled: offline, staleTime: Infinity });
  if (!offline) return null;
  return (
    <div role="status" className="relative z-10 border-b border-viewer-rule bg-viewer-raised text-viewer-ink">
      <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-3 text-[15px]">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 border-2 border-viewer-muted" />
        <span className="font-semibold">
          Sin conexión con el servidor · datos congelados
          {index?.month && (
            <>
              {" "}
              de {monthLong(index.month)} ({monthCode(index.month)})
            </>
          )}
        </span>
        <span className="text-viewer-muted">Es una foto fija: el monitor en directo y el simulador necesitan el servidor.</span>
      </p>
    </div>
  );
}
