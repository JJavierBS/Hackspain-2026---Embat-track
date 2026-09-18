import { Link, useLocation } from "react-router-dom";
import { Film } from "../components/Film";

export function NotFoundPage() {
  const { search } = useLocation();
  return (
    <Film title="Página no encontrada">
      <p>
        Esta dirección no existe.{" "}
        <Link to={{ pathname: "/", search }} className="font-semibold text-band-a underline underline-offset-4">
          Volver a la cartera
        </Link>
      </p>
    </Film>
  );
}
