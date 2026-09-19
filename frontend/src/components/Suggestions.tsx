import { Link } from "react-router-dom";
import type { Suggestions as SuggestionsData } from "../api/types";
import { Film } from "./Film";
import { formatIndicatorValue, indicatorLabel, monthShort } from "../lib/format";

function emptyMessage(data: SuggestionsData | null | undefined, hasScore: boolean) {
  if (!hasScore) return "En este periodo no hay puntuación ni datos suficientes para proponer recomendaciones. Prueba otro mes; no inventamos un diagnóstico.";
  if (!data) return "El backend no ha enviado sugerencias. Comprueba que frontend y backend estén usando la versión con este módulo.";
  if (data.state === "CONFIG_MISMATCH") return "La configuración no coincide con los resultados. No mostramos consejos hasta volver a prepararlos con el cálculo correcto.";
  if (data.state === "NO_EVIDENCE") return "No hay señales suficientes para proponer una actuación del catálogo en este mes. Esto no significa que no existan riesgos.";
  return "Todavía no hay sugerencias preparadas para esta empresa, mes y perfil. Las explicaciones del cálculo siguen disponibles más abajo.";
}

export function Suggestions({ data, hasScore = true }: { data?: SuggestionsData | null; hasScore?: boolean }) {
  const items = hasScore ? data?.items ?? [] : [];
  const ai = hasScore && data?.source === "helmcode" && items.length > 0;
  const example = import.meta.env.VITE_S7_EXAMPLE_URL as string | undefined;
  const meta = !hasScore ? "Sin puntuación en este periodo" : ai ? "IA verificada · Helmcode"
    : items.length > 0 ? "Reglas verificadas · sin respuesta IA" : "Sin recomendaciones disponibles";
  return (
    <Film id="sugerencias" title="Insights y recomendaciones" meta={meta}>
      <p className="mb-4 text-ink-muted">Qué revisar primero y por qué, con evidencia del periodo seleccionado.</p>
      {!ai && items.length > 0 && (
        <p className="mb-4 border-l-2 border-rule pl-3 text-sm text-ink-muted">
          No hay una respuesta de IA validada para esta empresa, mes y perfil. Se muestra el análisis por reglas, no texto generado por IA.
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-ink-muted">{emptyMessage(data, hasScore)}</p>
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
            {ai
              ? "Formulación verificada con Helmcode. El orden procede del cálculo, no de la IA."
              : "Texto de plantilla verificada. No se ha utilizado una respuesta de IA para estos consejos."}
          </p>
        </>
      )}
      {!ai && example?.startsWith("/entity/") && (
        <p className="mt-4 text-sm">
          <Link to={example} className="font-semibold underline underline-offset-4">Abrir caso configurado para la prueba de IA</Link>
          <span className="text-ink-muted"> · la preparación de IA se limita a los casos seleccionados, no a toda la cartera.</span>
        </p>
      )}
    </Film>
  );
}
