import { useId, type SVGProps } from "react";

// Weft: the personal build is branded "Tide" so it never reads as official T3 Code.
// Same geometry as the app icon (weft/assets/tide-icon.svg): three tide layers held in a circle.
// Brand colors live in weft.css as --tide-mark-*.
const LAYERS = [
  { y: 470, fill: "var(--tide-mark-back)" },
  { y: 570, fill: "var(--tide-mark-mid)" },
  { y: 670, fill: "var(--tide-mark-front)" },
] as const;
const wave = (y: number) =>
  `M150 ${y} c90.5 -73.15 90.5 -73.15 181 0 s90.5 73.15 181 0 c90.5 -73.15 90.5 -73.15 181 0 s90.5 73.15 181 0 V900 H150 Z`;

export function TideGlyph(props: SVGProps<SVGSVGElement>) {
  const clip = `tide-glyph-${useId()}`;
  return (
    <svg viewBox="212 212 600 600" {...props}>
      <defs>
        <clipPath id={clip}>
          <circle cx="512" cy="512" r="300" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="212" y="212" width="600" height="600" fill="var(--tide-mark-sky)" />
        {LAYERS.map((layer) => (
          <path key={layer.y} d={wave(layer.y)} fill={layer.fill} />
        ))}
      </g>
    </svg>
  );
}

export function TideWordmark({ className }: { className?: string }) {
  return (
    // oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark
    <span className={className} role="img" aria-label="Tide">
      <TideGlyph aria-hidden className="size-[1.4cap] shrink-0" />
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="[text-box:trim-both_cap_alphabetic]">{"Tide"}</span>
    </span>
  );
}
