import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfigTree } from "../lib/algorithm";
import { ApiError, apiSend } from "./client";
import type { PipelineStatus } from "./types";

export interface AlgorithmConfig {
  bootId: string;
  editable: boolean;
  overridden: boolean;
  appliedToData: boolean;
  editableSections: string[];
  config: ConfigTree;
  defaults: ConfigTree;
}

/** Plain fetch, no snapshot fallback: this page edits the live server or nothing. */
async function fetchConfig(): Promise<AlgorithmConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as AlgorithmConfig;
}

export function useAlgorithmConfig() {
  return useQuery({
    queryKey: ["algorithm-config"],
    queryFn: fetchConfig,
    retry: 1,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

export type ApplyPhase =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "restarting" }
  | { kind: "recalculating"; stage: string | null; percent: number }
  | { kind: "done"; sections: string[] }
  | { kind: "error"; message: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Save (PUT) or reset (DELETE), then follow the server: the context restarts (new bootId), the pipeline
 * re-runs, and the config reports appliedToData. Then every cached query is refetched.
 */
export function useApplyConfig(bootId: string | undefined) {
  const client = useQueryClient();
  const [phase, setPhase] = useState<ApplyPhase>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const follow = useCallback(
    async (request: () => Promise<{ changedSections: string[] }>) => {
      setPhase({ kind: "saving" });
      let sections: string[];
      try {
        sections = (await request()).changedSections;
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      setPhase({ kind: "restarting" });
      const deadline = Date.now() + 15 * 60_000;
      while (alive.current && Date.now() < deadline) {
        await wait(1200);
        let cfg: AlgorithmConfig;
        try {
          cfg = await fetchConfig();
        } catch {
          continue; // the server is between two contexts
        }
        if (cfg.bootId === bootId) continue;
        if (cfg.appliedToData) {
          await client.invalidateQueries();
          if (alive.current) setPhase({ kind: "done", sections });
          return;
        }
        try {
          const res = await fetch("/api/pipeline/status");
          const status = (await res.json()) as PipelineStatus;
          if (status.state === "FAILED") {
            setPhase({ kind: "error", message: `El recálculo falló: ${status.message ?? "sin detalle"}` });
            return;
          }
          setPhase({ kind: "recalculating", stage: status.currentStage, percent: status.percent });
        } catch {
          // status not ready yet
        }
      }
      if (alive.current) setPhase({ kind: "error", message: "El servidor no terminó el recálculo en 15 minutos." });
    },
    [bootId, client],
  );

  return {
    phase,
    busy: phase.kind === "saving" || phase.kind === "restarting" || phase.kind === "recalculating",
    save: (config: ConfigTree) => follow(() => apiSend("PUT", "/config", config)),
    reset: () => follow(() => apiSend("DELETE", "/config")),
    clear: () => setPhase({ kind: "idle" }),
  };
}

export interface PresetSource {
  publisher: string;
  title: string;
  url: string;
  /** Exact words of the source. */
  quote?: string;
  /** A figure read from a table. */
  finding?: string;
  read: string;
}

export interface PresetChange {
  path: string;
  value: unknown;
  status: "sourced" | "derived" | "placeholder";
  why: string;
  sources: string[];
}

export interface Preset {
  id: string;
  name: string;
  client: string;
  profile: "BANK" | "FUND" | "INSURER";
  weights: string;
  weightsSources?: string[];
  changes: PresetChange[];
}

export interface PresetCatalog {
  sources: Record<string, PresetSource>;
  presets: Preset[];
}

/** Client presets with their evidence (backend presets.yml). */
export function usePresets() {
  return useQuery({
    queryKey: ["algorithm-presets"],
    queryFn: async () => {
      const res = await fetch("/api/config/presets");
      if (!res.ok) throw new ApiError(res.status, await res.text());
      return (await res.json()) as PresetCatalog;
    },
    staleTime: Infinity,
    retry: 1,
  });
}
