// types.ts — mirrors the backend DTOs. Keep in sync with the shared contract.
export type PipelineState = "IDLE" | "RUNNING" | "DONE" | "FAILED";

export interface PipelineStatus {
  state: PipelineState;
  runId: string | null;
  currentStage: string | null;
  percent: number;
  message: string | null;
  stageTimingsMs: Record<string, number>;
}
