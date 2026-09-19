import { useCallback, useMemo, useState } from "react";
import type { Category } from "../api/types";
import { useAlgorithmConfig, useApplyConfig } from "../api/useAlgorithmConfig";
import { AlertLevels } from "../components/algorithm/AlertLevels";
import { AlgorithmContext, type AlgorithmState } from "../components/algorithm/AlgorithmContext";
import { IndicatorRow } from "../components/algorithm/AnchorEditor";
import { ChangeTray } from "../components/algorithm/ChangeTray";
import { PresetPicker } from "../components/algorithm/PresetPicker";
import { SectionNav } from "../components/algorithm/SectionNav";
import { BandMapField, FieldGrid } from "../components/algorithm/Fields";
import { WeightsTable } from "../components/algorithm/WeightsTable";
import { Film } from "../components/Film";
import { IconWarning } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { useHashScroll } from "../hooks/useHashScroll";
import { type Change, type ConfigTree, type IndicatorEntry, type Path, diff, setIn } from "../lib/algorithm";
import { BANDS, CATEGORY_LABELS, monthCode } from "../lib/format";

export function AlgorithmPage() {
  const { data, error, isLoading } = useAlgorithmConfig();
  const apply = useApplyConfig(data?.bootId);
  const [draft, setDraft] = useState<ConfigTree | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set());
  const [synced, setSynced] = useState(data);
  useHashScroll(draft !== null);

  // A new server config (first load, or after a restart) replaces the draft.
  if (data !== synced) {
    setSynced(data);
    setDraft(data?.config ?? null);
  }

  const reportInvalid = useCallback((key: string, bad: boolean) => {
    setInvalid((prev) => {
      if (prev.has(key) === bad) return prev;
      const next = new Set(prev);
      if (bad) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setAt = useCallback((path: Path, value: unknown) => setDraft((d) => (d ? setIn(d, path, value) : d)), []);

  const changes = useMemo<Change[]>(
    () => (data && draft ? diff(data.config, draft, data.editableSections) : []),
    [data, draft],
  );

  const state = useMemo<AlgorithmState | null>(
    () =>
      data && draft
        ? {
            draft,
            saved: data.config,
            defaults: data.defaults,
            editable: data.editable && !apply.busy,
            setAt,
            reportInvalid,
          }
        : null,
    [data, draft, apply.busy, setAt, reportInvalid],
  );

  if (error || isLoading || !data || !state) {
    return (
      <div className="grid gap-12">
        <Header />
        <LoadState error={error} title="Cargando la configuración" />
      </div>
    );
  }

  const byCategory = groupIndicators(state.draft.indicators as Record<string, IndicatorEntry>);

  return (
    <AlgorithmContext.Provider value={state}>
      <div className={`grid gap-12 ${changes.length > 0 || apply.phase.kind !== "idle" ? "pb-40" : ""}`}>
        <Header />
        <ExpertWarning
          editable={data.editable}
          overridden={data.overridden}
          applied={data.appliedToData}
          busy={apply.busy}
          onReset={apply.reset}
          onRerun={apply.rerun}
        />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
          <SectionNav changes={changes} />

          <div className="grid min-w-0 gap-12">
            <Film id="presets" className={JUMP} title="Presets por cliente" meta="4 clientes · cada valor con su fuente">
              <PresetPicker />
            </Film>

            <Film id="pesos" className={JUMP} title="Pesos por perfil" meta="10 categorías · suma 100 por perfil">
              <p className="mb-6 max-w-[70ch] text-ink-muted">
                Cuánto cuenta cada categoría en la puntuación de cada comprador. Una categoría sin datos se excluye y el
                resto se reparte su peso. Estos pesos se cerraron con el CTO de Embat el 19-09-2026
                (docs/WEIGHTS_JUSTIFICATION.md): cámbialos solo con un motivo que puedas defender.
              </p>
              <WeightsTable />
            </Film>

            <Film id="indicadores" className={JUMP} title="Indicadores y anclas" meta={`${Object.keys(state.draft.indicators as object).length} indicadores`}>
              <p className="mb-2 max-w-[70ch] text-ink-muted">
                Cada indicador pasa de su valor bruto a un nivel de 0 a 100 con una recta entre puntos fijos. Fuera del
                primer y del último punto, el nivel no cambia. El peso en su categoría es relativo: se reparte entre los
                indicadores disponibles.
              </p>
              {byCategory.map(([category, ids]) => (
                <section key={category} aria-labelledby={`cat-${category}`} className="mt-8">
                  <h3 id={`cat-${category}`} className="border-b border-ink/20 pb-2 text-xl font-semibold tracking-tight [font-stretch:88%]">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  {ids.map((id) => (
                    <IndicatorRow key={id} id={id} />
                  ))}
                </section>
              ))}
            </Film>

            <Film id="reglas" className={JUMP} title="Reglas de indicadores" meta="Casos límite y disponibilidad">
              <div className="grid gap-8">
                <FieldGrid path={["runwayCapMonths"]} />
                <FieldGrid path={["debtDscr"]} title="Cobertura de deuda" />
                <FieldGrid path={["levDebtToCf"]} title="Deuda sobre caja operativa" />
                <FieldGrid path={["concentration"]} title="Concentración" />
                <FieldGrid path={["windows"]} title="Ventanas de 12 meses" />
                <FieldGrid path={["taxRegularity"]} title="Regularidad fiscal" />
              </div>
            </Film>

            <Film id="trayectoria" className={JUMP} title="Trayectoria y regímenes" meta="Pendiente, CUSUM y baches">
              <div className="grid gap-8">
                <FieldGrid path={["trajectory"]} title="Trayectoria" />
                <FieldGrid path={["regimes"]} title="Bache frente a deterioro" />
                <FieldGrid path={["momentum"]} title="Categoría Momentum" />
              </div>
            </Film>

            <Film id="estados" className={JUMP} title="Estados y confianza" meta="Umbrales en puntos">
              <div className="grid gap-8">
                <FieldGrid path={["statuses"]} title="Estados" />
                <FieldGrid path={["confidence"]} title="Confianza" />
                <FieldGrid path={["explanation"]} title="Explicaciones" />
              </div>
            </Film>

            <Film id="limite" className={JUMP} title="Límite de circulante" meta="Producto del perfil Banco">
              <div className="grid gap-8">
                <FieldGrid path={["limitEngine"]} skip={["spreadBpsByBand"]} />
                <div className="grid gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">Diferencial por banda</h3>
                  <BandMapField path={["limitEngine", "spreadBpsByBand"]} unit="pb" note="La banda E no tiene diferencial: el límite se deniega." />
                </div>
              </div>
            </Film>

            <Film id="prima" className={JUMP} title="Prima y productos" meta="Aseguradora y Fondo">
              <div className="grid gap-8">
                <FieldGrid path={["insurer"]} skip={["multiplierByBand"]} title="Prima de crédito" />
                <div className="grid gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">Multiplicador de la prima por banda</h3>
                  <BandMapField path={["insurer", "multiplierByBand"]} unit="×" note="La banda E no tiene multiplicador: la entidad no es asegurable." />
                </div>
                <FieldGrid path={["products"]} title="Qué perfil lee cada producto" />
              </div>
            </Film>

            <Film id="alertas" className={JUMP} title="Alertas" meta="Aviso y crítica · SPEC §8.5">
              <div className="grid gap-8">
                <AlertLevels />
                <FieldGrid path={["alerts"]} skip={ALERT_LEVEL_KEYS} title="Ventanas y lista de vigilancia" />
              </div>
            </Film>

            <Film id="anticipacion" className={JUMP} title="Anticipación y escaparate" meta="Solo evaluación: no puntúa">
              <div className="grid gap-8">
                <FieldGrid path={["leadTime"]} title="Anticipación medida" />
                <FieldGrid path={["showcase"]} title="Parejas del escaparate" />
              </div>
            </Film>

            <Film id="prevision" className={JUMP} title="Previsión" meta="Solo salida: no puntúa">
              <FieldGrid path={["forecast"]} />
            </Film>

            <ReadOnlyFilm config={state.draft} />
          </div>
        </div>
      </div>
      <ChangeTray
        changes={changes}
        invalid={invalid.size}
        phase={apply.phase}
        onUndo={(c) => setAt(c.path, c.before)}
        onDiscard={() => setDraft(data.config)}
        onApply={() => apply.save(state.draft)}
        onClear={apply.clear}
      />
    </AlgorithmContext.Provider>
  );
}

/** Jump target offset: clears the sticky strip below lg, and the film tab everywhere. */
const JUMP = "scroll-mt-24! lg:scroll-mt-10!";

const ALERT_LEVEL_KEYS = [
  "runwayLow",
  "dscrBreach",
  "lineUtilHigh",
  "dsoDrift",
  "supplierLatenessUp",
  "overdueReceivables",
  "taxGap",
  "concentrationHigh",
  "factoringSpike",
  "scoreDrop",
];

function Header() {
  return (
    <PageHeader
      title="Algoritmo"
      lede="Todos los parámetros del cálculo: pesos de cada perfil, anclas de cada indicador, umbrales de estados y alertas, límite y prima. Para expertos en riesgo."
    />
  );
}

function groupIndicators(indicators: Record<string, IndicatorEntry>): [Category, string[]][] {
  const order = Object.keys(CATEGORY_LABELS) as Category[];
  return order
    .map((c) => [c, Object.keys(indicators).filter((id) => indicators[id].category === c)] as [Category, string[]])
    .filter(([, ids]) => ids.length > 0);
}

interface WarningProps {
  editable: boolean;
  overridden: boolean;
  applied: boolean;
  busy: boolean;
  onReset: () => void;
  onRerun: () => void;
}

/** The expert gate: what a change does, where the values come from, and whether the data on screen uses them. */
function ExpertWarning({ editable, overridden, applied, busy, onReset, onRerun }: WarningProps) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Film title="Zona de experto" meta={editable ? "Los cambios afectan a todas las páginas" : "Solo lectura"}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid content-start gap-4">
          <p className="flex items-start gap-3 text-2xl font-semibold tracking-tight [font-stretch:88%]">
            <IconWarning width={28} height={28} className="mt-0.5 shrink-0" />
            {editable ? "Aplicar un cambio recalcula todos los datos que muestra X-Ray." : "Esta instancia sirve datos congelados: puedes leer cada parámetro, pero no cambiarlo."}
          </p>
          {editable ? (
            <ul className="grid max-w-[68ch] gap-2 text-ink-muted">
              <li>
                El backend guarda tus valores en <code className="text-ink">data/scoring-overrides.yml</code>, se reinicia y
                vuelve a ejecutar el pipeline completo. Tarda alrededor de un minuto.
              </li>
              <li>
                Después cambian puntuaciones, bandas, estados, límites, primas, alertas y la anticipación medida, en todas las
                páginas y para todas las personas que usan este servidor.
              </li>
              <li>
                Los valores por defecto están en <code className="text-ink">scoring-config.yml</code> y siguen allí. Puedes
                volver a ellos en cualquier momento.
              </li>
            </ul>
          ) : (
            <p className="max-w-[68ch] text-ink-muted">
              El modo demo apaga el pipeline para que los datos no cambien durante la presentación. Para editar, arranca el
              backend con <code className="text-ink">XRAY_DEMO_MODE=false</code>.
            </p>
          )}
        </div>

        <div className="grid content-start gap-4">
          <dl className="grid gap-px border border-rule bg-rule text-sm">
            <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
              <dt className="text-ink-muted">Configuración</dt>
              <dd className="font-semibold">{overridden ? "Con ajustes de experto" : "Valores por defecto"}</dd>
            </div>
            <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
              <dt className="text-ink-muted">Datos en pantalla</dt>
              <dd className="font-semibold">{applied ? "Calculados con esta configuración" : "Pendientes de recalcular"}</dd>
            </div>
            <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
              <dt className="text-ink-muted">Edición</dt>
              <dd className="font-semibold">{editable ? "Permitida" : "Solo lectura · modo demo"}</dd>
            </div>
          </dl>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onRerun}
                title="Ejecuta el pipeline otra vez con la configuración activa, sin reiniciar el backend"
                className="border border-ink px-3 py-1.5 text-[15px] hover:bg-ink hover:text-film disabled:cursor-not-allowed disabled:opacity-45"
              >
                Recalcular ahora
              </button>
            </div>
          )}
          {editable && overridden && (
            <div className="flex flex-wrap items-center gap-2">
              {!confirm ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                  className="border border-ink px-3 py-1.5 text-[15px] hover:bg-ink hover:text-film disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Volver a los valores por defecto
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirm(false);
                      onReset();
                    }}
                    className="bg-ink px-3 py-1.5 text-[15px] font-semibold text-film hover:bg-ink/85"
                  >
                    Borrar ajustes y recalcular
                  </button>
                  <button type="button" onClick={() => setConfirm(false)} className="px-3 py-1.5 text-[15px] text-ink-muted hover:text-ink">
                    Cancelar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Film>
  );
}

/** Parameters this page does not edit, with the reason. */
function ReadOnlyFilm({ config }: { config: ConfigTree }) {
  const months = config.months as { start: string; end: string };
  return (
    <Film id="solo-lectura" className={JUMP} title="Fuera de este editor" meta="Solo lectura">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <h3 className="text-lg font-semibold tracking-tight">Bandas</h3>
          <div className="grid grid-cols-5 gap-px border border-rule bg-rule">
            {BANDS.map((b) => (
              <div key={b.band} className="bg-film px-2 pt-0 pb-2">
                <span aria-hidden className="-mx-2 mb-2 block h-1" style={{ background: b.color }} />
                <span className="block text-2xl font-semibold [font-stretch:80%]" style={{ color: b.color }}>
                  {b.band}
                </span>
                <span className="text-sm text-ink-muted">{b.range}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-muted">
            Toda la interfaz colorea con estos cortes. Cambiarlos solo en el backend daría colores que no casan con las letras.
          </p>
        </div>
        <dl className="grid content-start gap-px border border-rule bg-rule text-sm">
          <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
            <dt className="text-ink-muted">Unidad puntuada</dt>
            <dd className="font-semibold">{config.unit === "GROUP" ? "Grupo" : "Empresa"}</dd>
          </div>
          <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
            <dt className="text-ink-muted">Meses</dt>
            <dd className="font-semibold">
              {months.start} a {months.end} <span className="font-normal text-ink-muted">({monthCode(months.start)} a {monthCode(months.end)})</span>
            </dd>
          </div>
          <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 bg-film px-3 py-2">
            <dt className="text-ink-muted">Semántica de datos</dt>
            <dd>
              Clases de flujo, tipos de cambio, reglas de facturas e intragrupo. Salen del perfilado de los CSV
              (docs/DATA_FINDINGS.md) y se cambian en <code>scoring-config.yml</code>.
            </dd>
          </div>
        </dl>
      </div>
    </Film>
  );
}
