import { usePipelineStatus } from "../api/usePipelineStatus";

type BadgeState = "DONE" | "RUNNING" | "FAILED" | "IDLE" | "OFFLINE";

const LAMPS: Record<BadgeState, { label: string; lamp: string }> = {
  DONE: { label: "Listo", lamp: "bg-scan shadow-[0_0_10px_2px_rgb(15_163_194/0.6)]" },
  RUNNING: { label: "Calculando", lamp: "bg-amber-400 shadow-[0_0_10px_2px_rgb(251_191_36/0.55)] animate-pulse" },
  FAILED: { label: "Error", lamp: "bg-red-500 shadow-[0_0_10px_2px_rgb(239_68_68/0.5)]" },
  IDLE: { label: "En espera", lamp: "bg-viewer-muted" },
  OFFLINE: { label: "Sin conexión", lamp: "border border-red-400 bg-transparent" },
};

/** The viewer's exposure lamp: pipeline state from GET /api/pipeline/status. */
export function PipelineBadge() {
  const { data, isError } = usePipelineStatus();
  const state: BadgeState = isError ? "OFFLINE" : (data?.state ?? "IDLE");
  const { label, lamp } = LAMPS[state];
  const detail = state === "RUNNING" && data?.currentStage ? `${data.currentStage} · ${data.percent}%` : null;

  return (
    <span
      role="status"
      title={data?.message ?? (isError ? "Backend no disponible" : `Pipeline ${state}`)}
      className="inline-flex items-center gap-2 border border-viewer-rule px-2.5 py-1 text-sm text-viewer-ink"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${lamp}`} />
      <span className="text-viewer-muted">Pipeline</span>
      <span className="font-medium">{label}</span>
      {detail && <span className="text-viewer-muted">{detail}</span>}
    </span>
  );
}
