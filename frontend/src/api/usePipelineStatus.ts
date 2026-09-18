import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";
import type { PipelineStatus } from "./types";

/** Polls every 2 s while a run is active, every 30 s otherwise. */
export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: () => apiGet<PipelineStatus>("/pipeline/status"),
    refetchInterval: (query) => (query.state.data?.state === "RUNNING" ? 2_000 : 30_000),
    retry: false,
  });
}
