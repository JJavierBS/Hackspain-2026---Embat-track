import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MONTHS } from "../hooks/useGlobalParams";
import { monthCode, monthLong, monthShort } from "../lib/format";
import { IconChevron, IconNext, IconPrev } from "./Icons";

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

const MONTH_NAME = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

/** "ene", "feb" … for the 12 slots of a year row, January first. */
const MONTH_SLOTS = Array.from({ length: 12 }, (_, i) =>
  MONTH_NAME.format(new Date(Date.UTC(2000, i, 1))).replace(".", ""),
);

/**
 * The month readout of the viewer: step back, the month in words with its M-code, step forward.
 * The readout opens a month grid, one row of 12 slots per year; months outside the data stay empty.
 * The strip next to it picks any month directly.
 */
export function MonthStepper({ value, onChange }: MonthProps) {
  const i = MONTHS.indexOf(value);
  const prev = i > 0 ? MONTHS[i - 1] : null;
  const next = i < MONTHS.length - 1 ? MONTHS[i + 1] : null;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function pick(m: string) {
    onChange(m);
    close();
  }

  /** Arrows move one month, up and down one year row (6 columns: half a year). */
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
      return;
    }
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const from = MONTHS.indexOf((document.activeElement as HTMLElement | null)?.dataset.pick ?? value);
    const to = MONTHS[Math.min(MONTHS.length - 1, Math.max(0, from + delta))];
    root.current?.querySelector<HTMLButtonElement>(`[data-pick="${to}"]`)?.focus();
  }

  const step =
    "grid w-9 place-items-center text-viewer-muted transition-colors hover:bg-viewer-raised hover:text-viewer-ink disabled:pointer-events-none disabled:opacity-35";
  return (
    <div ref={root} className="relative">
      <div className="segmented flex items-stretch border border-viewer-rule">
        <button type="button" className={step} disabled={!prev} onClick={() => prev && onChange(prev)}
          aria-label={prev ? `Mes anterior: ${monthShort(prev)}` : "Mes anterior"}>
          <IconPrev />
        </button>
        <button
          ref={trigger}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Mes: ${monthTitle(value)} (${monthCode(value)}). Elegir otro mes`}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-[13rem] items-center justify-center gap-2 border-x border-viewer-rule px-3 py-1.5 transition-colors hover:bg-viewer-raised ${open ? "bg-viewer-raised" : ""}`}
        >
          <span className="text-[15px] font-semibold whitespace-nowrap">{monthTitle(value)}</span>
          <span className="text-sm text-viewer-muted tabular-nums">{monthCode(value)}</span>
          <IconChevron className={`text-viewer-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} width={14} height={14} />
        </button>
        <button type="button" className={step} disabled={!next} onClick={() => next && onChange(next)}
          aria-label={next ? `Mes siguiente: ${monthShort(next)}` : "Mes siguiente"}>
          <IconNext />
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Elegir mes"
          onKeyDown={onGridKey}
          className="absolute top-full left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-control)] border border-viewer-rule bg-viewer p-3 text-viewer-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
        >
          {YEARS.map(({ year, months }) => (
            <div key={year} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 border-b border-viewer-rule py-2.5 first:pt-0 last:border-b-0 last:pb-0">
              <span className={`pt-1.5 text-sm tabular-nums ${value.startsWith(year) ? "font-semibold text-viewer-ink" : "text-viewer-muted"}`}>{year}</span>
              <div className="grid grid-cols-6 gap-1">
                {MONTH_SLOTS.map((name, slot) => {
                  const m = `${year}-${String(slot + 1).padStart(2, "0")}`;
                  if (!months.includes(m)) {
                    return (
                      <span key={m} aria-hidden className="py-1.5 text-center text-sm text-viewer-rule">
                        {name}
                      </span>
                    );
                  }
                  const selected = m === value;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={`${monthTitle(m)} (${monthCode(m)})`}
                      title={monthCode(m)}
                      data-pick={m}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => pick(m)}
                      className={`rounded-[var(--radius-control)] py-1.5 text-center text-sm transition-colors focus-visible:outline-offset-0 ${
                        selected
                          ? "bg-scan font-semibold text-white shadow-[0_0_10px_1px_rgb(56_120_246/0.5)]"
                          : "text-viewer-ink hover:bg-viewer-raised"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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
