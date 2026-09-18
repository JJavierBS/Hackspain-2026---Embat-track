import { useQuery } from "@tanstack/react-query";
import type { Profile } from "../hooks/useGlobalParams";
import { apiGet } from "./client";
import type { EntityDetail, MonitorData, Portfolio } from "./types";

/** true when the app runs on synthetic demo data (VITE_MOCKS=true). */
export const USE_MOCKS = import.meta.env.VITE_MOCKS === "true";

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
    queryFn: async () => {
      if (!USE_MOCKS) return apiGet<EntityDetail>(`/entities/${id}?profile=${profile}&month=${month}`);
      const detail = (await mocks()).mockEntity(id, profile, month);
      if (!detail) throw new Error(`Entidad ${id} no encontrada`);
      return detail;
    },
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
    placeholderData: (previous) => previous,
  });
}
