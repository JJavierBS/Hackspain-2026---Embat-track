import { useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Profile } from "../hooks/useGlobalParams";
import { ApiError, apiGet, apiPost, getOfflineSnapshot, subscribeOffline } from "./client";
import type {
  Direction,
  EntityDetail,
  LeadTime,
  LimitSimulation,
  Meta,
  Methodology,
  MonitorData,
  Portfolio,
  Profiles,
  Severity,
  ShowcasePairs,
  SimulateLimitRequest,
  Watchlist,
} from "./types";

/** true when the app runs on synthetic demo data (VITE_MOCKS=true). */
export const USE_MOCKS = import.meta.env.VITE_MOCKS === "true";

/**
 * A 404 is an answer (unknown entity, or an endpoint of a later block), not a network hiccup: do not retry it.
 * Once the app reads the frozen snapshot, the server is known to be down: fail fast to the error film.
 */
function retryUnless404(failures: number, error: Error): boolean {
  if (getOfflineSnapshot()) return false;
  return !(error instanceof ApiError && error.status === 404) && failures < 3;
}

/** true once any GET was served from the frozen snapshot in public/fallback (SPEC §14). */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, getOfflineSnapshot);
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

/** horizon: months to project from ?month (phase 7). The backend clamps it to 1..max-horizon-months. */
export function useEntity(id: string, profile: Profile, month: string, horizon?: number) {
  return useQuery({
    queryKey: ["entity", id, profile, month, horizon],
    enabled: id !== "",
    queryFn: async () => {
      if (!USE_MOCKS) {
        const h = horizon === undefined ? "" : `&horizon=${horizon}`;
        const detail = await apiGet<EntityDetail>(`/entities/${id}?profile=${profile}&month=${month}${h}`);
        // A backend before block 6 sends no `alerts`, one before phase 6 no `events`, one before phase 7 no
        // `forecast`: read them as empty.
        return { ...detail, alerts: detail.alerts ?? [], events: detail.events ?? [], forecast: detail.forecast ?? null };
      }
      const detail = (await mocks()).mockEntity(id, profile, month, horizon);
      if (!detail) throw new Error(`Entidad ${id} no encontrada`);
      return detail;
    },
    retry: retryUnless404,
    placeholderData: (previous) => (previous?.id === id ? previous : undefined),
  });
}

export interface MonitorFilters {
  severity?: Severity;
  direction?: Direction;
}

export function useMonitor(profile: Profile, month: string, filters: MonitorFilters = {}) {
  const { severity, direction } = filters;
  return useQuery({
    queryKey: ["monitor", profile, month, severity ?? null, direction ?? null],
    queryFn: async () => {
      if (USE_MOCKS) return (await mocks()).mockMonitor(profile, month, { severity, direction });
      // Only the filters that are set go in the query string.
      const q = new URLSearchParams({ profile, month });
      if (severity) q.set("severity", severity);
      if (direction) q.set("direction", direction);
      return apiGet<MonitorData>(`/monitor/alerts?${q.toString()}`);
    },
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

export function useWatchlist(profile: Profile, month: string) {
  return useQuery({
    queryKey: ["watchlist", profile, month],
    queryFn: async () =>
      USE_MOCKS
        ? (await mocks()).mockWatchlist(profile, month)
        : apiGet<Watchlist>(`/monitor/watchlist?profile=${profile}&month=${month}`),
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

/** Alert catalogue and product parameters of the current config (no weights: those come from /api/profiles). */
export function useMethodology() {
  return useQuery({
    queryKey: ["methodology"],
    queryFn: async () => (USE_MOCKS ? (await mocks()).mockMethodology() : apiGet<Methodology>("/methodology")),
    retry: retryUnless404,
    staleTime: 60_000,
  });
}

/** Measured anticipation of the profile (SPEC §8.4): events, leads, false alarms. */
export function useLeadTime(profile: Profile) {
  return useQuery({
    queryKey: ["lead-time", profile],
    queryFn: async () =>
      USE_MOCKS ? (await mocks()).mockLeadTime(profile) : apiGet<LeadTime>(`/analytics/lead-time?profile=${profile}`),
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

/** Ranked pairs with the same score today and opposite trajectories (SPEC §10.4, decision G9). */
export function useShowcasePairs(profile: Profile, month: string) {
  return useQuery({
    queryKey: ["showcase-pairs", profile, month],
    queryFn: async () =>
      USE_MOCKS
        ? (await mocks()).mockShowcasePairs(profile, month)
        : apiGet<ShowcasePairs>(`/analytics/showcase-pairs?profile=${profile}&month=${month}`),
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

/** The one request that computes (F8): O(1) arithmetic on the stored limit decision. It writes nothing. */
export function useSimulateLimit(id: string) {
  return useMutation({
    mutationFn: async (body: SimulateLimitRequest) =>
      USE_MOCKS
        ? (await mocks()).mockSimulate(id, body)
        : apiPost<LimitSimulation>(`/entities/${id}/limit/simulate`, body),
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
