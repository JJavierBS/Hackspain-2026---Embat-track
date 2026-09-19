import type { KeyboardEvent } from "react";
import { MONTHS } from "../hooks/useGlobalParams";
import { monthCode, monthLong, monthShort } from "../lib/format";
import { IconNext, IconPrev } from "./Icons";

interface MonthProps {
  value: string;
  onChange: (month: string) => void;
}

const YEARS = [...new Set(MONTHS.map((m) => m.slice(0, 4)))].map((year) => ({
  year,
  months: MONTHS.filter((m) => m.startsWith(year)),
}));

/** "2026-08" → "Agosto 2026". */
function monthTitle(month: string): string {
  const s = monthLong(month).replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The month readout of the viewer: step back, the month in words with its M-code, step forward.
 * The strip next to it picks any month directly.
 */
export function MonthStepper({ value, onChange }: MonthProps) {
  const i = MONTHS.indexOf(value);
  const prev = i > 0 ? MONTHS[i - 1] : null;
  const next = i < MONTHS.length - 1 ? MONTHS[i + 1] : null;
  const step =
    "grid w-9 place-items-center text-viewer-muted transition-colors hover:bg-viewer-raised hover:text-viewer-ink disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="segmented flex items-stretch border border-viewer-rule">
      <button type="button" className={step} disabled={!prev} onClick={() => prev && onChange(prev)}
        aria-label={prev ? `Mes anterior: ${monthShort(prev)}` : "Mes anterior"}>
        <IconPrev />
      </button>
      <output aria-live="polite" className="flex w-[12rem] items-baseline justify-center gap-2 border-x border-viewer-rule px-3 py-1.5">
        <span className="text-[15px] font-semibold whitespace-nowrap">{monthTitle(value)}</span>
        <span className="text-sm text-viewer-muted tabular-nums">{monthCode(value)}</span>
      </output>
      <button type="button" className={step} disabled={!next} onClick={() => next && onChange(next)}
        aria-label={next ? `Mes siguiente: ${monthShort(next)}` : "Mes siguiente"}>
        <IconNext />
      </button>
    </div>
  );
}

/**
 * 24 exposure ticks, one per month, grouped by year under a hairline rule. Elapsed months read brighter than the
 * months still to come; the selected month is lit in scan blue. Hover or focus names the month.
 */
export function MonthStrip({ value, onChange }: MonthProps) {
  const current = MONTHS.indexOf(value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? MONTHS.length - 1 : null;
    if (!step && jump === null) return;
    e.preventDefault();
    const next = MONTHS[jump ?? Math.min(MONTHS.length - 1, Math.max(0, current + step))];
    onChange(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${next}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Mes (línea temporal)" onKeyDown={onKeyDown} className="flex w-full gap-3 lg:w-auto">
      {YEARS.map(({ year, months }) => {
        const live = value.startsWith(year);
        return (
          <div key={year} className="flex min-w-0 flex-col gap-1 lg:flex-none" style={{ flexGrow: months.length }}>
            <span className={`text-xs leading-none tabular-nums ${live ? "font-semibold text-viewer-ink" : "text-viewer-muted"}`}>{year}</span>
            <div className="flex h-7 items-end border-b border-viewer-rule">
              {months.map((m) => {
                const i = MONTHS.indexOf(m);
                const selected = m === value;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${monthShort(m)} (${monthCode(m)})`}
                    data-month={m}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onChange(m)}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center focus-visible:outline-offset-0 lg:w-3.5 lg:flex-none"
                  >
                    <span
                      className={`block transition-[height,background-color] duration-150 ${
                        selected
                          ? "h-7 w-[5px] bg-scan shadow-[0_0_10px_1px_rgb(56_120_246/0.7)]"
                          : i < current
                            ? "h-3.5 w-[3px] bg-viewer-muted group-hover:h-5 group-hover:bg-viewer-ink"
                            : "h-2 w-[3px] bg-viewer-rule group-hover:h-5 group-hover:bg-viewer-ink"
                      }`}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 hidden -translate-x-1/2 border border-viewer-rule bg-viewer-raised px-1.5 py-0.5 text-xs whitespace-nowrap text-viewer-ink group-hover:block group-focus-visible:block"
                    >
                      {monthShort(m)} · {monthCode(m)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
