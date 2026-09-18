import type { HTMLAttributes } from "react";

/** A plain film: flat panel, hairline border, corner marks (see .film in index.css). */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`film p-5 ${className}`} {...props} />;
}
