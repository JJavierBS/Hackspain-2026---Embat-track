import { useParams } from "react-router-dom";
import { BandLadder } from "../components/BandLadder";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";

export function EntityPage() {
  const { id } = useParams();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={<>Entidad {id}</>}
        lede="La radiografía de una entidad: su nivel, hacia dónde va y qué movió el número."
      />
      <BandLadder />
      <PendingFilm
        title="Radiografía"
        block="bloque 5"
        items={[
          "Puntuación final, nivel y trayectoria",
          "Evolución mensual con cambios de régimen",
          "Por qué esta puntuación: impulsores + y −",
          "Indicadores con valor, nivel y tendencia",
        ]}
      />
    </div>
  );
}
