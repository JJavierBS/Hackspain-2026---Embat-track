import { createContext, useContext } from "react";
import type { ConfigTree, Path } from "../../lib/algorithm";

export interface AlgorithmState {
  /** The values on screen, with the expert's unsaved edits. */
  draft: ConfigTree;
  /** The values the server runs on now. */
  saved: ConfigTree;
  /** The shipped scoring-config.yml. */
  defaults: ConfigTree;
  editable: boolean;
  setAt: (path: Path, value: unknown) => void;
  /** A field reports text that is not a valid value; Apply stays locked while any field does. */
  reportInvalid: (key: string, invalid: boolean) => void;
}

export const AlgorithmContext = createContext<AlgorithmState | null>(null);

export function useAlgorithm(): AlgorithmState {
  const state = useContext(AlgorithmContext);
  if (!state) throw new Error("useAlgorithm needs an AlgorithmContext provider");
  return state;
}
