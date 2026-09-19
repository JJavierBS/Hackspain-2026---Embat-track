import { useSearchParams } from "react-router-dom";

export const PROFILES = ["BANK", "FUND", "INSURER"] as const;
export type Profile = (typeof PROFILES)[number];

/** M00 = 2024-09 … M23 = 2026-08 (SPEC §3.2). Block 4 reads this from /api/meta. */
export const MONTHS: string[] = Array.from({ length: 24 }, (_, i) =>
  new Date(Date.UTC(2024, 8 + i, 1)).toISOString().slice(0, 7),
);
export const DEFAULT_MONTH = "2026-08";

function isProfile(value: string | null): value is Profile {
  return value !== null && (PROFILES as readonly string[]).includes(value);
}

/** profile and month live in the URL so every view is linkable (SPEC §12.6). */
export function useGlobalParams() {
  const [params, setParams] = useSearchParams();
  const rawProfile = params.get("profile");
  const rawMonth = params.get("month");
  const profile: Profile = isProfile(rawProfile) ? rawProfile : "BANK";
  const month = rawMonth && MONTHS.includes(rawMonth) ? rawMonth : DEFAULT_MONTH;

  function update(key: "profile" | "month", value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });
  }

  return {
    profile,
    month,
    setProfile: (p: Profile) => update("profile", p),
    setMonth: (m: string) => update("month", m),
  };
}
