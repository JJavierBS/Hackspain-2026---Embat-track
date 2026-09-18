import { Film } from "./Film";

interface PendingFilmProps {
  title: string;
  block: string;
  items: string[];
}

/** An unexposed film: names what this view shows once its block ships. */
export function PendingFilm({ title, block, items }: PendingFilmProps) {
  return (
    <Film title={title} meta={`Llega en el ${block}`}>
      <p className="text-ink-muted">Sin datos todavía. Esta vista mostrará:</p>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-baseline gap-3 border-t border-dashed border-rule pt-2">
            <span aria-hidden className="h-2 w-2 shrink-0 translate-y-[-1px] border border-ink-muted" />
            {item}
          </li>
        ))}
      </ul>
    </Film>
  );
}
