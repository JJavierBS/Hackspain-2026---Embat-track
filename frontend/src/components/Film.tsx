import type { ReactNode } from "react";

interface FilmProps {
  title: string;
  /** Short measurement readout, printed on the top rule opposite the tab. */
  meta?: ReactNode;
  className?: string;
  /** Anchor target, so another view can link to this film (e.g. "#anticipacion"). */
  id?: string;
  children: ReactNode;
}

/** A titled film: the tab carries the title, two notches mark where the viewer clips hold it. */
export function Film({ title, meta, className = "", id, children }: FilmProps) {
  return (
    <section id={id} className={`film scroll-mt-6 px-5 pt-10 pb-6 ${className}`}>
      <h2 className="film-tab">{title}</h2>
      <span aria-hidden className="film-notch left-[calc(50%-28px)] hidden sm:block" />
      <span aria-hidden className="film-notch left-[calc(50%+12px)] hidden sm:block" />
      {meta && (
        <>
          <div className="film-meta hidden md:block">{meta}</div>
          <div className="-mt-3 mb-5 text-right text-sm text-ink-muted md:hidden">{meta}</div>
        </>
      )}
      {children}
    </section>
  );
}
