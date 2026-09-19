import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Profile } from "../hooks/useGlobalParams";
import type { ConfigTree } from "../lib/algorithm";
import { ApiError } from "./client";
import type { PresetChange, PresetSource } from "./useAlgorithmConfig";

export interface SectorNote {
  text: string;
  sources: string[];
}

export interface Sector {
  id: string;
  name: string;
  cnae: string;
  client: string;
  changes: PresetChange[];
  notes?: SectorNote[];
}

export interface SectorCatalog {
  sources: Record<string, PresetSource>;
  sectors: Sector[];
}

/** Sector presets with their evidence (backend sectors.yml). */
export function useSectors() {
  return useQuery({
    queryKey: ["sectors"],
    queryFn: async () => {
      const res = await fetch("/api/config/sectors");
      if (!res.ok) throw new ApiError(res.status, await res.text());
      return (await res.json()) as SectorCatalog;
    },
    staleTime: Infinity,
    retry: 1,
  });
}

export interface TuningPoint {
  finalScore: number | null;
  level: number | null;
  traj: number | null;
  band: string | null;
}

export interface TuningResult {
  entityId: string;
  entityType: "GROUP" | "COMPANY";
  month: string;
  profile: Profile;
  sector: { id: string; name: string; applied: string[] } | null;
  draftApplied: boolean;
  profiles: { profile: Profile; base: TuningPoint; tuned: TuningPoint }[];
  series: { month: string; base: number | null; tuned: number | null }[];
  categories: { category: string; baseWeight: number; tunedWeight: number; baseLevel: number | null; tunedLevel: number | null }[];
  indicators: {
    indicator: string;
    category: string;
    available: boolean;
    value: number | null;
    baseLevel: number | null;
    tunedLevel: number | null;
    baseAnchors: [number, number][];
    tunedAnchors: [number, number][];
  }[];
}

interface TuningInput {
  id: string;
  profile: Profile;
  month: string;
  sector?: string | null;
  /** Indicators of the sector whose anchors apply. Undefined applies them all. */
  sectorIndicators?: string[];
  /** Editable sections of the Algorithm draft that differ from the config in use. */
  config?: ConfigTree | null;
}

/**
 * POST /entities/{id}/tuning: the what-if score of one entity. It writes nothing on the server, so it is a query,
 * keyed on everything it reads. A 4xx body {"error": "..."} becomes the message.
 */
export function useTuning(input: TuningInput, enabled = true) {
  return useQuery({
    queryKey: ["tuning", input.id, input.profile, input.month, input.sector ?? null, input.sectorIndicators ?? null, input.config ?? null],
    enabled: enabled && input.id !== "",
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/entities/${encodeURIComponent(input.id)}/tuning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: input.profile,
          month: input.month,
          sector: input.sector ?? null,
          sectorIndicators: input.sectorIndicators ?? null,
          config: input.config ?? null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          // not JSON: keep the text
        }
        throw new ApiError(res.status, message);
      }
      return (await res.json()) as TuningResult;
    },
  });
}
