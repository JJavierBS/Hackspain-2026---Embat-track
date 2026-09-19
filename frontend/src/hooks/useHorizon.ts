import { useSearchParams } from "react-router-dom";

/**
 * Months to project on the entity page (phase 7, decision H11). It lives in the URL, like profile and month,
 * so the view stays linkable. 3 by default: past 3 months the backtest error exceeds one band width
 * (docs/FORECAST.md). The backend clamps any value to 1..max-horizon-months.
 */
export const DEFAULT_HORIZON = 3;

export function useHorizon() {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("horizon"));
  const horizon = Number.isInteger(raw) && raw >= 1 ? raw : DEFAULT_HORIZON;
  function setHorizon(h: number) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("horizon", String(h));
        return next;
      },
      { replace: true },
    );
  }
  return { horizon, setHorizon };
}
