import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function IconUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  );
}

export function IconDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
    </svg>
  );
}

export function IconFlat(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
    </svg>
  );
}

/** The X-Ray mark: a film frame crossed by the scan line. */
export function XRayMark(props: IconProps) {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden {...props}>
      <rect x="1.5" y="1.5" width="19" height="19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6.5 16 15.5M16 6.5 6 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.5 11h19" stroke="var(--color-scan)" strokeWidth="2" />
    </svg>
  );
}
