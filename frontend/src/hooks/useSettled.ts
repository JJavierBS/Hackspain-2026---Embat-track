import { useEffect, useState } from "react";

/**
 * The value after it stopped changing for `ms`. A null drops through at once: nothing left to preview.
 * One keystroke is not one question to the server.
 */
export function useSettled<T>(value: T | null, ms: number): T | null {
  const [settled, setSettled] = useState<T | null>(value);
  const [seen, setSeen] = useState<T | null>(value);
  if (seen !== value) {
    setSeen(value);
    if (value === null) setSettled(null);
  }
  useEffect(() => {
    if (value === null) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
