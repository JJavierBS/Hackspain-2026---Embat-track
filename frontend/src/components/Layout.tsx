import { Outlet, useLocation } from "react-router-dom";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { OfflineBanner } from "./OfflineBanner";
import { TopBar } from "./TopBar";

export function Layout() {
  const { pathname } = useLocation();
  const { profile } = useGlobalParams();

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="relative flex flex-1 flex-col overflow-clip bg-panel [container-type:inline-size]">
        <OfflineBanner />
        {/* A new view or a new buyer profile re-scans the panel once. */}
        <span key={`${pathname}|${profile}`} aria-hidden className="scanline" />
        <div className="lightbox flex-1">
          <div className="mx-auto w-full max-w-7xl px-6 py-12">
            <Outlet />
          </div>
        </div>
      </main>
      <footer className="bg-viewer px-4 py-3 text-center text-xs text-viewer-muted sm:px-6">
        X-Ray · Byte_Me · HackSpain 2026 · Datos sintéticos de Embat
      </footer>
    </div>
  );
}
