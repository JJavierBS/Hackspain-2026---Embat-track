import { BandLadder } from "../components/BandLadder";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { ScoreReadout } from "../components/ScoreReadout";
import { TrendChart, type TrendPoint } from "../components/TrendChart";
import { MONTHS } from "../hooks/useGlobalParams";
import { monthCode } from "../lib/format";

/** Illustrative series for the reading guide. Not Embat data. */
const EXAMPLE: TrendPoint[] = MONTHS.map((month, i) => {
  // An entity that climbs from band D to band B, with a short dip around M10.
  const level = 36 + 1.6 * i - 7 * Math.exp(-((i - 10) ** 2) / 6);
  const trajectory = 55 + 15 * Math.cos((i - 14) / 6);
  return {
    month,
    level: Math.round(level * 10) / 10,
    trajectory: Math.round(trajectory * 10) / 10,
    final: Math.round((0.7 * level + 0.3 * trajectory) * 10) / 10,
  };
});

const EXAMPLE_MONTH = "2026-05";

export function MethodologyPage() {
  const now = EXAMPLE.find((p) => p.month === EXAMPLE_MONTH)!;
  const before = EXAMPLE[MONTHS.indexOf(EXAMPLE_MONTH) - 3];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Metodología"
        lede="Cómo leer cada número de X-Ray: bandas, dirección y evolución. Los pesos de cada perfil llegan con el bloque 7."
      />

      <Film title="Cómo leer una puntuación" meta="Ejemplo ilustrativo · no son datos reales">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-6">
            <ScoreReadout score={now.final} delta={now.final - before.final} against={`vs ${monthCode(before.month)}`} />
            <dl className="grid gap-3 text-[15px]">
              <div>
                <dt className="font-semibold">Número y letra</dt>
                <dd className="text-ink-muted">La puntuación final (0–100) toma el color de su banda, de A a E.</dd>
              </div>
              <div>
                <dt className="font-semibold">Flecha</dt>
                <dd className="flex flex-wrap items-center gap-x-3 text-ink-muted">
                  <span className="inline-flex items-center gap-1 font-semibold text-up">
                    <IconUp /> mejora
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-down">
                    <IconDown /> empeora
                  </span>
                  Verde y rojo solo indican dirección.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Franja cian</dt>
                <dd className="text-ink-muted">Marca el mes seleccionado en todas las gráficas.</dd>
              </div>
            </dl>
          </div>
          <TrendChart data={EXAMPLE} activeMonth={EXAMPLE_MONTH} />
        </div>
      </Film>

      <Film title="Bandas" meta="Umbrales de la puntuación final">
        <BandLadder active="B" />
      </Film>

      <PendingFilm
        title="Pesos e indicadores"
        block="bloque 7"
        items={["Tablas de pesos por perfil", "Catálogo de indicadores", "Anticipación medida (lead time)", "Limitaciones de los datos"]}
      />
    </div>
  );
}
