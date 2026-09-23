import { useState } from "react";
import { Link } from "react-router-dom";
import { Film } from "../components/Film";
import { JumpNav, type JumpSection } from "../components/JumpNav";
import { useHashScroll } from "../hooks/useHashScroll";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { AUTHORS, CHAPTERS, type Chapter, HOURS, type HourBin, REPO_URL, type Turn, binTotal } from "../lib/story";

/** Films clear the sticky strip on small screens, as on the Methodology page. */
const JUMP = "scroll-mt-24! lg:scroll-mt-10!";

const PEAK = Math.max(...HOURS.map(binTotal));
const DAY_NAMES = { vie: "viernes", sáb: "sábado", dom: "domingo" } as const;
const pad = (h: number) => String(h).padStart(2, "0");

function chapterCommits(c: Chapter) {
  return HOURS.slice(c.bins[0], c.bins[1] + 1).reduce((sum, b) => sum + binTotal(b), 0);
}

export function StoryPage() {
  useHashScroll(true);
  const sections: JumpSection[] = [
    { id: "carrete", title: "El carrete" },
    ...CHAPTERS.map((c) => ({ id: c.id, title: c.short })),
    { id: "proximamente", title: "Próximamente" },
  ];

  return (
    <div className="grid gap-12">
      <Header />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <JumpNav sections={sections} label="Capítulos de la historia" />
        <div className="grid min-w-0 gap-12">
          <Reel />
          {CHAPTERS.map((c, i) => (
            <div key={c.id} className="grid gap-12">
              <ChapterFilm chapter={c} />
              {i === 0 && <Silence />}
            </div>
          ))}
          <ComingSoon />
        </div>
      </div>
    </div>
  );
}

function Header() {
  const cells = [
    { term: "Duración", value: "28 h 32 min" },
    { term: "Commits", value: "240" },
    { term: "Pull requests", value: "28" },
    { term: "Decisiones", value: "37" },
  ];
  return (
    <div className="grid gap-6 border-b border-ink/15 pb-6 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance [font-stretch:88%] sm:text-5xl">Cómo lo construimos</h1>
        <p className="mt-3 max-w-[62ch] text-base text-pretty text-ink-muted">
          Un fin de semana, tres personas y nueve atajos que los datos nos obligaron a descartar. La historia de X-Ray contada desde su
          historial de git y su registro de decisiones, sin retoques.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-px self-end border border-rule bg-rule text-sm sm:grid-cols-4 md:w-[34rem]">
        {cells.map((c) => (
          <div key={c.term} className="bg-film px-3 py-2">
            <dt className="text-sm text-ink-muted">{c.term}</dt>
            <dd className="text-2xl font-semibold whitespace-nowrap [font-stretch:88%]">{c.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Commits per hour, stacked by author, with the chapters bracketed underneath. */
function Reel() {
  const peakIndex = HOURS.findIndex((b) => binTotal(b) === PEAK);
  const [picked, setPicked] = useState<number | null>(null);
  const shown = HOURS[picked ?? peakIndex];

  return (
    <Film id="carrete" className={JUMP} title="El carrete" meta="206 commits de autor · una barra por hora">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <HourReadout bin={shown} peak={picked === null} />
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
          {AUTHORS.map((a) => (
            <li key={a.id} className="inline-flex items-center gap-2">
              <span aria-hidden className={`h-3 w-3 ${a.swatch}`} />
              {a.name} <span className="text-ink-muted">{a.commits}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="-mx-5 mt-6 overflow-x-auto px-5 pb-2">
        <div className="min-w-[40rem]">
          <div className="grid h-48 grid-cols-[repeat(29,minmax(0,1fr))] items-end gap-[3px] border-b border-ink" onMouseLeave={() => setPicked(null)}>
            {HOURS.map((b, i) => (
              <Bar key={i} bin={b} active={picked === i} onPick={() => setPicked(i)} onLeave={() => setPicked(null)} />
            ))}
          </div>

          <div className="grid grid-cols-[repeat(29,minmax(0,1fr))] gap-[3px] pt-1.5 text-sm text-ink-muted">
            {HOURS.map((b, i) => (
              <span key={i} className={`text-center ${b.hour % 3 === 0 || i === 0 ? "" : "invisible"}`}>
                {pad(b.hour)}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-[repeat(29,minmax(0,1fr))] gap-[3px] pt-4">
            {CHAPTERS.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{ gridColumn: `${c.bins[0] + 1} / ${c.bins[1] + 2}` }}
                className="group border-t-2 border-ink pt-1.5 text-sm leading-tight font-medium hover:border-scan"
              >
                <span className="underline decoration-transparent underline-offset-4 group-hover:decoration-ink">{c.short}</span>
              </a>
            ))}
            <span
              style={{ gridColumn: "6 / 11" }}
              className="row-start-1 border-t border-dashed border-ink-muted pt-1.5 text-center text-sm text-ink-muted"
            >
              dormir
            </span>
          </div>

          <div className="mt-3 grid grid-cols-[repeat(29,minmax(0,1fr))] gap-[3px] text-sm font-semibold">
            <span style={{ gridColumn: "1 / 4" }}>Viernes</span>
            <span style={{ gridColumn: "4 / 28" }} className="border-l border-rule pl-2">
              Sábado
            </span>
            <span style={{ gridColumn: "28 / 30" }} className="border-l border-rule pl-2">
              Dom.
            </span>
          </div>
        </div>
      </div>
    </Film>
  );
}

function HourReadout({ bin, peak }: { bin: HourBin; peak: boolean }) {
  const total = binTotal(bin);
  const parts = AUTHORS.filter((a) => bin[a.id] > 0).map((a) => `${a.name} ${bin[a.id]}`);
  return (
    <p aria-live="polite" className="text-[15px]">
      <span className="font-semibold">
        {peak ? "La hora punta: " : ""}
        {DAY_NAMES[bin.day]} {pad(bin.hour)}:00
      </span>
      <span className="text-ink-muted"> · </span>
      <span className="text-2xl font-semibold [font-stretch:85%]">{total}</span> {total === 1 ? "commit" : "commits"}
      {parts.length > 1 && <span className="text-ink-muted"> ({parts.join(", ")})</span>}
    </p>
  );
}

function Bar({ bin, active, onPick, onLeave }: { bin: HourBin; active: boolean; onPick: () => void; onLeave: () => void }) {
  const total = binTotal(bin);
  const label = `${DAY_NAMES[bin.day]} ${pad(bin.hour)}:00, ${total} ${total === 1 ? "commit" : "commits"}`;
  return (
    <button
      type="button"
      aria-label={label}
      onMouseEnter={onPick}
      onFocus={onPick}
      onBlur={onLeave}
      className="relative flex h-full flex-col justify-end rounded-none! outline-offset-0"
    >
      {active && <span aria-hidden className="absolute inset-x-0 top-0 bottom-0 bg-scan-soft" />}
      {total === 0 ? (
        <span aria-hidden className="relative h-px w-full bg-rule" />
      ) : (
        <span aria-hidden className="relative flex w-full flex-col-reverse" style={{ height: `${(total / PEAK) * 100}%` }}>
          {AUTHORS.map((a) =>
            bin[a.id] > 0 ? <span key={a.id} className={`w-full ${a.swatch}`} style={{ height: `${(bin[a.id] / total) * 100}%` }} /> : null,
          )}
        </span>
      )}
    </button>
  );
}

/** The one stretch with no commits. Dashed, as everything not yet exposed. */
function Silence() {
  return (
    <div className="flex items-center gap-4 text-[15px] text-ink-muted" role="note">
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-ink-muted/60" />
      <span className="text-center">
        <span className="font-semibold text-ink">02:17 – 07:09</span> · Casi cinco horas sin un solo commit
      </span>
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-ink-muted/60" />
    </div>
  );
}

function ChapterFilm({ chapter: c }: { chapter: Chapter }) {
  const n = chapterCommits(c);
  return (
    <Film id={c.id} className={JUMP} title={c.title} meta={`${c.span} · ${n} commits`}>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <p className="max-w-[34ch] text-2xl leading-snug font-semibold tracking-tight text-balance [font-stretch:92%] sm:text-[1.75rem]">
            {c.thesis}
          </p>
          <div className="mt-6 grid max-w-[62ch] gap-4 text-base leading-relaxed text-pretty">
            {c.body.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </div>
        <CommitLog commits={c.commits} />
      </div>
      {c.turns.length > 0 && (
        <div className="mt-10 grid gap-6">
          {c.turns.map((t) => (
            <TurnRow key={t.ref} turn={t} />
          ))}
        </div>
      )}
    </Film>
  );
}

function CommitLog({ commits }: { commits: Chapter["commits"] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm text-ink-muted">En el historial</h3>
      <ol className="mt-2 border-t border-ink/20">
        {commits.map((c) => (
          <li key={c.hash} className="border-b border-dashed border-rule">
            <a
              href={`${REPO_URL}/commit/${c.hash}`}
              target="_blank"
              rel="noreferrer"
              className="group grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-2 text-sm hover:bg-scan-soft/40"
            >
              <span className="text-ink-muted">{c.time}</span>
              <span className="min-w-0">
                <span className="break-words group-hover:underline group-hover:underline-offset-4">{c.subject}</span>
                <span className="mt-0.5 block font-mono text-xs text-ink-muted">{c.hash}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Temptation, the measurement that beat it, and the rule we kept. The rule is inverted: it is what stayed. */
function TurnRow({ turn: t }: { turn: Turn }) {
  return (
    <figure className="grid gap-px border border-rule bg-rule md:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,5fr)]">
      <div className="bg-film px-4 py-4">
        <p className="text-sm text-ink-muted">La tentación</p>
        <p className="mt-2 text-[17px] leading-snug text-pretty">{t.temptation}</p>
      </div>
      <div className="bg-film px-4 py-4">
        <p className="text-sm text-ink-muted">La prueba</p>
        <p className="mt-1 text-3xl leading-tight font-semibold text-balance [font-stretch:80%] sm:text-4xl">{t.proof.figure}</p>
        <p className="mt-1 text-sm text-pretty text-ink-muted">{t.proof.caption}</p>
      </div>
      <figcaption className="flex flex-col bg-ink px-4 py-4 text-film">
        <p className="flex items-center justify-between gap-3 text-sm text-viewer-muted">
          <span>La regla que quedó</span>
          <span className="border border-viewer-rule px-1.5 font-mono text-xs text-film">{t.ref}</span>
        </p>
        <p className="mt-2 text-[17px] leading-snug font-semibold text-pretty">{t.rule}</p>
      </figcaption>
    </figure>
  );
}

/** The next chapter is not exposed yet. Dashed, as everything not yet exposed. */
function ComingSoon() {
  const search = useLinkSearch();
  return (
    <Film id="proximamente" className={JUMP} title="Próximo capítulo" meta="Sin revelar">
      <div className="grid place-items-center gap-4 border border-dashed border-ink-muted/60 px-6 py-16 text-center">
        <p className="text-5xl font-semibold tracking-tight [font-stretch:80%] sm:text-6xl">Próximamente</p>
        <p className="max-w-[40ch] text-base text-pretty text-ink-muted">Este carrete todavía no se ha revelado.</p>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-ink/20 pt-5 text-[15px]">
        <p className="text-ink-muted">
          <span className="font-semibold text-ink">Byte_Me</span> · {AUTHORS.map((a) => a.name).join(", ")} · HackSpain 2026, reto Embat
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to={{ pathname: "/methodology", search }} className="font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink">
            Leer la metodología
          </Link>
          <Link to={{ pathname: "/", search }} className="font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink">
            Abrir la cartera
          </Link>
        </div>
      </div>
    </Film>
  );
}
