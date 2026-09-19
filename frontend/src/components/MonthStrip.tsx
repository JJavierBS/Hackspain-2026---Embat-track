import type { KeyboardEvent } from "react";
import { MONTHS } from "../hooks/useGlobalParams";
import { monthCode, monthShort } from "../lib/format";

interface MonthStripProps {
  value: string;
  onChange: (month: string) => void;
}

/** 24 exposure ticks, one per month. The selected month is lit in scan cyan. */
export function MonthStrip({ value, onChange }: MonthStripProps) {
  const current = MONTHS.indexOf(value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = MONTHS[Math.min(MONTHS.length - 1, Math.max(0, current + step))];
    onChange(next);
    const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${next}"]`);
    target?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Mes (línea temporal)" onKeyDown={onKeyDown} className="flex w-full items-end gap-[3px] lg:w-auto">
      {MONTHS.map((m, i) => {
        const selected = m === value;
        const yearStart = m.endsWith("-01") || i === 0;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${monthShort(m)} (${monthCode(m)})`}
            title={`${monthShort(m)} · ${monthCode(m)}`}
            data-month={m}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(m)}
            className="group relative flex h-8 min-w-0 flex-1 items-end justify-center focus-visible:outline-offset-0 lg:w-3 lg:flex-none"
          >
            {yearStart && (
              <span className="pointer-events-none absolute -top-4 left-0 text-xs leading-none text-viewer-muted">
                {m.slice(0, 4)}
              </span>
            )}
            <span
              className={`block w-[3px] transition-none ${
                selected
                  ? "h-8 w-[5px] bg-scan shadow-[0_0_10px_1px_rgb(56_120_246/0.7)]"
                  : i < current
                    ? "h-4 bg-viewer-muted/70 group-hover:h-6 group-hover:bg-viewer-ink"
                    : "h-3 bg-viewer-rule group-hover:h-6 group-hover:bg-viewer-ink"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
