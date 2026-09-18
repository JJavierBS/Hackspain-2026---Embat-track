import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";

export function MonitorPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Monitor"
        lede="Alertas tempranas que saltan solas, mes a mes. Las buenas noticias también avisan."
      />
      <PendingFilm
        title="Alertas y watchlist"
        block="bloque 6"
        items={["Watchlist de entidades", "Feed de alertas por severidad y dirección", "Replay mes a mes", "Alertas positivas en verde"]}
      />
    </div>
  );
}
