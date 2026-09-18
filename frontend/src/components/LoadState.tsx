import { Film } from "./Film";

/** Loading and error states share the film frame so the page never jumps. */
export function LoadState({ error, title = "Cargando" }: { error?: unknown; title?: string }) {
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <Film title="No se pudo cargar">
        <p className="text-ink">{message}</p>
        <p className="mt-2 text-ink-muted">Comprueba que el backend está en marcha, o arranca el frontend con `npm run dev:mock`.</p>
      </Film>
    );
  }
  return (
    <Film title={title}>
      <div className="grid gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-5 animate-pulse bg-panel-grid" style={{ width: `${90 - i * 18}%` }} />
        ))}
      </div>
    </Film>
  );
}
