import type { ReactNode } from "react";

interface FilmProps {
  title: string;
  /** Short measurement readout on the right of the title row. */
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled film. The title row is separated from the reading by one hairline. */
export function Film({ title, meta, className = "", children }: FilmProps) {
  return (
    <section className={`film ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {meta && <div className="text-sm text-ink-muted">{meta}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
