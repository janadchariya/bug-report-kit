// Inline SVG icons (Lucide-style, 24x24 viewBox, currentColor stroke).
// Skill rule: no emoji icons — use SVG.

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export function IconCheck({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function IconCamera({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function IconBug({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      {/* Lucide-style bug: body + antennae + 3 legs each side */}
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 7l-3 2M5 7l3 2" />
      <path d="M3 13h4M17 13h4M3 17l4-1M17 16l4 1M3 9l4 1M17 10l4-1" />
      <path d="M12 20v-7" />
    </svg>
  );
}

