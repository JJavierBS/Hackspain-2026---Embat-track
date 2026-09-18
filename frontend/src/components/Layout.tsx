import { Outlet, useLocation } from "react-router-dom";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { TopBar } from "./TopBar";

export function Layout() {
  const { pathname } = useLocation();
  const { profile } = useGlobalParams();

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="lightbox relative flex-1 overflow-hidden">
        {/* A new view or a new buyer profile re-scans the panel once. */}
        <span key={`${pathname}|${profile}`} aria-hidden className="scanline" />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <Outlet />
        </div>
      </main>
      <footer className="bg-viewer px-4 py-3 text-center text-xs text-viewer-muted sm:px-6">
        X-Ray · Byte_Me · HackSpain 2026 · Datos sintéticos de Embat
      </footer>
    </div>
  );
}
