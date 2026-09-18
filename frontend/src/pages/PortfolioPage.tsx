import { BandLadder } from "../components/BandLadder";
import { Film } from "../components/Film";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";

/** The six questions of the track, as the status filters of block 4 (SPEC §8.3). */
const QUESTIONS = ["Sanas y excepcionales", "Mejorando", "Empiezan a torcerse", "Bache", "Deterioro", "Críticas"];

export function PortfolioPage() {
  return (
    <div className="grid gap-12">
      <PageHeader
        title="Cartera"
        lede="Quién está sana, quién mejora y quién empieza a torcerse. Cambia de perfil y el ranking se recalcula con los pesos de ese comprador."
      />
      <Film title="Distribución por banda" meta="Puntuación final 0–100">
        <BandLadder />
      </Film>
      <Film title="Las seis preguntas" meta="Filtros de estado · llegan en el bloque 4">
        <div className="flex flex-wrap gap-2">
          {QUESTIONS.map((q) => (
            <span key={q} className="border border-dashed border-ink-muted/50 px-3 py-1.5 text-[15px] text-ink-muted">
              {q}
            </span>
          ))}
        </div>
      </Film>
      <PendingFilm
        title="Ranking de entidades"
        block="bloque 4"
        items={[
          "Ranking ordenable por puntuación final",
          "Color de banda y flecha de variación a 3 meses",
          "Mini-gráfica de evolución por entidad",
          "Alertas activas y nivel de confianza",
        ]}
      />
    </div>
  );
}
