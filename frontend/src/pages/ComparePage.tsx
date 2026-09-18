import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";

export function ComparePage() {
  return (
    <div className="grid gap-12">
      <PageHeader
        title="Comparar"
        lede="Dos entidades con la misma nota hoy y trayectorias opuestas, lado a lado."
      />
      <PendingFilm
        title="Dos entidades lado a lado"
        block="bloque 8"
        items={["Evoluciones superpuestas", "Pareja destacada precargada", "Diferencias por categoría", "Nivel frente a trayectoria"]}
      />
    </div>
  );
}
