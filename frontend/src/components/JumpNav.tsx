import { useEffect, useMemo, useRef, useState } from "react";

/** Distance from the viewport top where a film counts as the one being read (its tab sits there). */
const READ_LINE = 120;

const behavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: behavior(), block: "start" });
  // Keep ?profile and ?month: only the hash changes, and no history entry per click.
  history.replaceState(history.state, "", `${location.pathname}${location.search}#${id}`);
}

/**
 * The section under the read line, updated on scroll.
 * A section picked from the nav (or the URL hash) stays lit until the reader scrolls by hand:
 * the last short films never reach the read line, so the page-end rule would light another one.
 */
function useCurrentSection(ids: string[]): [string, (id: string) => void] {
  const [current, setCurrent] = useState(ids[0]);
  const pinned = useRef<string | null>(null);
  const pin = (id: string) => {
    pinned.current = id;
    setCurrent(id);
  };
  useEffect(() => {
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (ids.includes(fromHash)) pinned.current = fromHash;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (pinned.current) {
        setCurrent(pinned.current);
        return;
      }
      let active = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - READ_LINE <= 0) active = id;
      }
      // At the page end, the last short films never reach the read line: light the last one.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = ids[ids.length - 1];
      setCurrent(active);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const unpin = () => {
      pinned.current = null;
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", unpin, { passive: true });
    window.addEventListener("touchmove", unpin, { passive: true });
    window.addEventListener("keydown", unpin);
    window.addEventListener("mousedown", unpin);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", unpin);
      window.removeEventListener("touchmove", unpin);
      window.removeEventListener("keydown", unpin);
      window.removeEventListener("mousedown", unpin);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);
  return [current, pin];
}

export interface JumpSection {
  id: string;
  title: string;
  /** A count printed on the entry (the Algorithm page counts unsaved edits). Hidden at 0. */
  count?: number;
  countTitle?: string;
}

/**
 * Jump list of a long page. A sticky column from lg, a sticky scrolling strip below it.
 * The section being read is inverted in ink, like a pressed toggle.
 * The page puts it in a `lg:grid-cols-[13rem_minmax(0,1fr)]` grid next to its films.
 */
export function JumpNav({ sections, label }: { sections: JumpSection[]; label: string }) {
  const key = sections.map((s) => s.id).join(" ");
  const ids = useMemo(() => key.split(" "), [key]);
  const [current, pin] = useCurrentSection(ids);
  const strip = useRef<HTMLOListElement>(null);

  // Keep the current entry visible in the mobile strip.
  useEffect(() => {
    const item = strip.current?.querySelector<HTMLElement>(`[data-id="${current}"]`);
    item?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  function link(s: JumpSection, variant: "column" | "strip") {
    const active = s.id === current;
    return (
      <a
        href={`#${s.id}`}
        aria-current={active ? "location" : undefined}
        onClick={(e) => {
          e.preventDefault();
          pin(s.id);
          scrollToSection(s.id);
        }}
        className={`flex items-center justify-between gap-3 transition-colors ${
          variant === "column" ? "px-3 py-2" : "px-3 py-1.5 whitespace-nowrap"
        } ${active ? "bg-ink font-semibold text-film" : "bg-film text-ink hover:bg-scan-soft/40"}`}
      >
        <span>{s.title}</span>
        {!!s.count && (
          <span
            className={`min-w-6 px-1.5 text-center text-sm font-semibold ${active ? "bg-film text-ink" : "bg-ink text-film"}`}
            title={s.countTitle}
          >
            {s.count}
          </span>
        )}
      </a>
    );
  }

  return (
    <>
      <nav aria-label={label} className="sticky top-0 z-10 -mx-6 min-w-0 border-b border-rule bg-panel px-6 py-2 lg:hidden">
        <ol ref={strip} className="flex gap-px overflow-x-auto border border-rule bg-rule text-[15px]">
          {sections.map((s) => (
            <li key={s.id} data-id={s.id} className="shrink-0">
              {link(s, "strip")}
            </li>
          ))}
        </ol>
      </nav>
      <nav aria-label={label} className="hidden lg:block">
        <div className="sticky top-6 grid gap-2">
          <ol className="grid gap-px border border-rule bg-rule text-[15px]">
            {sections.map((s) => (
              <li key={s.id}>{link(s, "column")}</li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              pin(ids[0]);
              window.scrollTo({ top: 0, behavior: behavior() });
              history.replaceState(history.state, "", `${location.pathname}${location.search}`);
            }}
            className="w-fit text-sm text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Volver arriba
          </button>
        </div>
      </nav>
    </>
  );
}
