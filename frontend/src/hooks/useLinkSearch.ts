import { useGlobalParams } from "./useGlobalParams";

/** The search string that carries profile and month to the next view. */
export function useLinkSearch(extra: Record<string, string> = {}): string {
  const { profile, month } = useGlobalParams();
  return `?${new URLSearchParams({ profile, month, ...extra }).toString()}`;
}
