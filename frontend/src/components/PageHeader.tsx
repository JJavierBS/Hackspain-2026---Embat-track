import type { ReactNode } from "react";
import { PROFILE_LABELS, monthCode, monthLong } from "../lib/format";
import { useGlobalParams } from "../hooks/useGlobalParams";

interface PageHeaderProps {
  title: ReactNode;
  lede: ReactNode;
}

/** Page title plus the study readout: which buyer view and which month is on the viewer. */
export function PageHeader({ title, lede }: PageHeaderProps) {
  const { profile, month } = useGlobalParams();
  const label = PROFILE_LABELS[profile];
  return (
    <div className="grid gap-6 border-b border-ink/15 pb-6 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight [font-stretch:88%] sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-[62ch] text-base text-ink-muted">{lede}</p>
      </div>
      <dl className="grid grid-cols-3 gap-px self-end border border-rule bg-rule text-sm md:w-[26rem]">
        <div className="bg-film px-3 py-2">
          <dt className="text-sm text-ink-muted">Vista</dt>
          <dd className="font-semibold">{label.name}</dd>
        </div>
        <div className="bg-film px-3 py-2">
          <dt className="text-sm text-ink-muted">Producto</dt>
          <dd className="font-semibold">{label.product}</dd>
        </div>
        <div className="bg-film px-3 py-2">
          <dt className="text-sm text-ink-muted">Mes</dt>
          <dd className="font-semibold">
            {monthLong(month)} <span className="font-normal text-ink-muted">{monthCode(month)}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
