import { type Change, SECTIONS, countIn } from "../../lib/algorithm";
import { JumpNav } from "../JumpNav";

/** Jump list of the Algorithm page; each entry counts its unsaved edits. */
export function SectionNav({ changes }: { changes: Change[] }) {
  const sections = SECTIONS.map((s) => {
    const n = s.keys.reduce((sum, k) => sum + countIn(changes, k), 0);
    return { id: s.id, title: s.title, count: n, countTitle: `${n} ${n === 1 ? "cambio sin guardar" : "cambios sin guardar"}` };
  });
  return <JumpNav sections={sections} label="Secciones del algoritmo" />;
}
