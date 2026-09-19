import { ApiError, isServerDown } from "../api/client";
import { useOffline } from "../api/queries";
import { Film } from "./Film";

/** Loading and error states share the film frame so the page never jumps. */
export function LoadState({ error, title = "Cargando" }: { error?: unknown; title?: string }) {
  const offline = useOffline();
  if (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // A 502 from the proxy has an empty body: name the status instead of printing nothing.
    const message = raw.trim() || (error instanceof ApiError ? `El servidor respondió ${error.status}.` : "Error desconocido.");
    return (
      <Film title="No se pudo cargar">
        <p className="text-ink">{message}</p>
        {offline || isServerDown(error) ? (
          <p className="mt-2 text-ink-muted">
            Esta función necesita el servidor.{" "}
            {offline ? "Los datos congelados no la incluyen." : "Comprueba que el backend está en marcha, o arranca el frontend con `npm run dev:mock`."}
          </p>
        ) : (
          <p className="mt-2 text-ink-muted">Comprueba la dirección, o vuelve a la cartera.</p>
        )}
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
