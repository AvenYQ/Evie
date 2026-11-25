import type { SVGProps } from "react";

// Weft: the personal build is branded "Tide" so it never reads as official T3 Code.
export const TIDE_ACCENT = "var(--app-theme-accent, #D45C3D)";

export function TideGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 64" fill="none" strokeWidth={9} strokeLinecap="round" {...props}>
      <path d="M6 24 q13.5 -16 27 0 t27 0 t27 0 t27 0" stroke={TIDE_ACCENT} />
      <path d="M6 46 q13.5 -16 27 0 t27 0 t27 0 t27 0" stroke="currentColor" />
    </svg>
  );
}

export function TideWordmark({ className }: { className?: string }) {
  return (
    // oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark
    <span className={className} role="img" aria-label="Tide">
      <TideGlyph aria-hidden className="h-[1.15cap] w-auto shrink-0" />
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="[text-box:trim-both_cap_alphabetic]">{"Tide"}</span>
    </span>
  );
}
