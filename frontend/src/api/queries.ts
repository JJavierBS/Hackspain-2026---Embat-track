import { useQuery } from "@tanstack/react-query";
import type { Profile } from "../hooks/useGlobalParams";
import { ApiError, apiGet } from "./client";
import type { EntityDetail, Meta, MonitorData, Portfolio, Profiles } from "./types";

/** true when the app runs on synthetic demo data (VITE_MOCKS=true). */
export const USE_MOCKS = import.meta.env.VITE_MOCKS === "true";

/** A 404 is an answer (unknown entity, or an endpoint of a later block), not a network hiccup: do not retry it. */
function retryUnless404(failures: number, error: Error): boolean {
  return !(error instanceof ApiError && error.status === 404) && failures < 3;
}

/** Loads the generator only in mock mode, so a normal build does not ship it. */
const mocks = () => import("../mocks/generate");

export function usePortfolio(profile: Profile, month: string) {
  return useQuery({
    queryKey: ["portfolio", profile, month],
    queryFn: async () =>
      USE_MOCKS
        ? (await mocks()).mockPortfolio(profile, month)
        : apiGet<Portfolio>(`/portfolio?profile=${profile}&month=${month}`),
    placeholderData: (previous) => previous,
  });
}

export function useEntity(id: string, profile: Profile, month: string) {
  return useQuery({
    queryKey: ["entity", id, profile, month],
    enabled: id !== "",
    queryFn: async () => {
      if (!USE_MOCKS) return apiGet<EntityDetail>(`/entities/${id}?profile=${profile}&month=${month}`);
      const detail = (await mocks()).mockEntity(id, profile, month);
      if (!detail) throw new Error(`Entidad ${id} no encontrada`);
      return detail;
    },
    retry: retryUnless404,
    placeholderData: (previous) => (previous?.id === id ? previous : undefined),
  });
}

export function useMonitor(profile: Profile, month: string) {
  return useQuery({
    queryKey: ["monitor", profile, month],
    queryFn: async () =>
      USE_MOCKS
        ? (await mocks()).mockMonitor(profile, month)
        : apiGet<MonitorData>(`/monitor/alerts?profile=${profile}&month=${month}`),
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: async () => (USE_MOCKS ? (await mocks()).mockMeta() : apiGet<Meta>("/meta")),
    staleTime: 60_000,
  });
}

/** The weights that produced the scores on screen (profile_weights of the last run). */
export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (USE_MOCKS ? (await mocks()).mockProfiles() : apiGet<Profiles>("/profiles")),
    staleTime: 60_000,
  });
}
