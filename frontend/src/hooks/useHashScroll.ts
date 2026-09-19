import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the element named by the URL hash once `ready` is true.
 * React Router does not do it, and the target film renders only after its data arrives.
 */
export function useHashScroll(ready: boolean) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!ready || hash === "") return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [ready, hash, pathname]);
}
