import { NavLink, useLocation } from "react-router-dom";
import { PROFILES, useGlobalParams } from "../hooks/useGlobalParams";
import { USE_MOCKS } from "../api/queries";
import { PROFILE_LABELS } from "../lib/format";
import { XRayMark } from "./Icons";
import { MonthStepper, MonthStrip } from "./MonthStrip";
import { PipelineBadge } from "./PipelineBadge";

const NAV = [
  { to: "/", label: "Cartera" },
  { to: "/monitor", label: "Monitor" },
  { to: "/compare", label: "Comparar" },
  { to: "/methodology", label: "Metodología" },
  { to: "/algorithm", label: "Algoritmo" },
];

/** The viewer frame: navigation, the profile cord, the month stepper and strip, and the pipeline lamp. */
export function TopBar() {
  const { profile, month, setProfile, setMonth } = useGlobalParams();
  const { search } = useLocation();

  return (
    <header className="bg-viewer text-viewer-ink">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 pt-3 sm:px-6">
        <NavLink to={{ pathname: "/", search }} className="flex items-center gap-2.5" aria-label="X-Ray, inicio">
          <XRayMark />
          <span className="text-xl font-semibold tracking-tight [font-stretch:85%]">X-Ray</span>
        </NavLink>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto text-[15px] sm:order-none sm:w-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={item.to === "/"}
              className={({ isActive }) =>
                `border-b-2 px-2 py-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-scan font-semibold text-viewer-ink"
                    : "border-transparent text-viewer-muted hover:text-viewer-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          {USE_MOCKS ? (
            <span
              title="La app usa datos sintéticos generados en el navegador, no datos de Embat."
              className="inline-flex items-center gap-2 rounded border border-coral/70 px-2.5 py-1 text-sm text-viewer-ink"
            >
              <span aria-hidden className="h-2 w-2 bg-coral" />
              Datos de demostración
            </span>
          ) : (
            <PipelineBadge />
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-4 pb-3 sm:px-6">
        <div role="radiogroup" aria-label="Perfil" className="segmented flex border border-viewer-rule">
          {PROFILES.map((p) => {
            const active = p === profile;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setProfile(p)}
                className={`px-4 py-1.5 text-[15px] transition-colors ${
                  active
                    ? "bg-viewer-ink font-semibold text-viewer"
                    : "text-viewer-muted hover:bg-viewer-raised hover:text-viewer-ink"
                }`}
              >
                {PROFILE_LABELS[p].name}
              </button>
            );
          })}
        </div>

        <MonthStepper value={month} onChange={setMonth} />

        <div className="order-last w-full lg:order-none lg:w-auto">
          <MonthStrip value={month} onChange={setMonth} />
        </div>
      </div>
    </header>
  );
}
