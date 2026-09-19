import type { Suggestions as SuggestionsData } from "../api/types";
import { Film } from "./Film";
import { formatIndicatorValue, indicatorLabel, monthShort } from "../lib/format";

export function Suggestions({ data }: { data?: SuggestionsData | null }) {
  const items = data?.items ?? [];
  return (
    <Film id="sugerencias" title="Qué revisar primero" meta="Prioridades de atención · sin puntos prometidos">
      {items.length === 0 ? (
        <p className="text-ink-muted">
          {data?.state === "CONFIG_MISMATCH"
            ? "La configuración no coincide con los resultados. No mostramos consejos hasta volver a prepararlos con el cálculo correcto."
            : data?.state === "NO_EVIDENCE"
              ? "No hay evidencia suficiente para proponer una actuación del catálogo en este mes. Esto no significa que no existan riesgos."
              : "Sugerencias todavía no preparadas para este mes y perfil. Puedes consultar las explicaciones del cálculo más abajo."}
        </p>
      ) : (
        <>
          <ol className="grid gap-5">
            {items.map((item, index) => (
              <li key={item.id} className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
                <p className="text-lg font-medium"><span className="mr-3 text-ink-muted">{index + 1}.</span>{item.text}</p>
                <details className="mt-2 text-sm text-ink-muted">
                  <summary className="w-fit cursor-pointer underline underline-offset-4">Ver evidencia y límites</summary>
                  <p className="mt-2">
                    {indicatorLabel(item.evidence.indicatorId)}: {formatIndicatorValue(item.evidence.indicatorId, item.evidence.value)}
                    {" · "}{monthShort(item.evidence.month)}.
                  </p>
                  {item.evidence.fallback && <p>Comparación alternativa por falta de historia anual completa.</p>}
                  {item.evidence.anchorStatus === "PENDING" && <p>La normalización usa un umbral provisional pendiente de revisión.</p>}
                  <p>Es una señal para investigar, no una causa demostrada ni un efecto simulado de la actuación.</p>
                  <p>{data?.limitation}</p>
                  <a href="#indicadores" className="underline underline-offset-4">Consultar indicadores de esta ficha</a>
                </details>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-rule pt-3 text-sm text-ink-muted">Son señales para investigar, no ganancias garantizadas. Antes de regularizar pagos, comprueba la caja disponible.</p>
          <p className="mt-2 text-sm text-ink-muted" title={data?.model ?? undefined}>
            {data?.source === "helmcode"
              ? "Formulación verificada con Helmcode. El orden procede del cálculo, no de la IA."
              : "Texto de plantilla verificada. No se ha utilizado una respuesta de IA para estos consejos."}
          </p>
        </>
      )}
    </Film>
  );
}
