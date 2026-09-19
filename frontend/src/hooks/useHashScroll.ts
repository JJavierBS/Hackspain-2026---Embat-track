import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the element named by the URL hash once `ready` is true.
 * React Router does not do it, and the target film renders only after its data arrives.
 */
export function useHashScroll(ready: boolean, resetWithoutHash = false) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!ready) return;
    if (hash === "") {
      if (resetWithoutHash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [ready, hash, pathname, resetWithoutHash]);
}
