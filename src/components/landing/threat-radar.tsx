"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The hero centrepiece: a sweeping radar with threat contacts.
 *
 * Contacts are placed deterministically from the threat data rather than
 * randomly, so the picture is stable between renders and does not flicker on
 * hydration. Distance from centre encodes severity — critical threats sit
 * closest to the core they are attacking.
 */

export interface RadarContact {
  label: string;
  severity: "critical" | "high" | "medium";
  count: number;
}

const SEVERITY_RADIUS = { critical: 0.32, high: 0.55, medium: 0.76 };
const SEVERITY_COLOR = {
  critical: "var(--color-critical)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
};

/** Deterministic angle from the label, so contacts never jump between renders. */
function angleFor(label: string, index: number): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return ((hash % 360) + index * 47) % 360;
}

export function ThreatRadar({
  contacts,
  className,
  size = 340,
}: {
  contacts: RadarContact[];
  className?: string;
  size?: number;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const centre = size / 2;
  const maxRadius = size / 2 - 26;

  const placed = React.useMemo(
    () =>
      contacts.slice(0, 7).map((c, i) => {
        const angle = (angleFor(c.label, i) * Math.PI) / 180;
        const radius = maxRadius * SEVERITY_RADIUS[c.severity];
        return {
          ...c,
          x: centre + Math.cos(angle) * radius,
          y: centre + Math.sin(angle) * radius,
          delay: (i * 0.42) % 2.4,
        };
      }),
    [contacts, centre, maxRadius],
  );

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Threat radar showing ${contacts.length} active threat categories`}>
        <defs>
          <radialGradient id="radar-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.32" />
            <stop offset="55%" stopColor="var(--color-brand)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radar-sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx={centre} cy={centre} r={maxRadius} fill="url(#radar-core)" />

        {/* Range rings */}
        {[0.32, 0.55, 0.76, 1].map((r) => (
          <circle
            key={r}
            cx={centre}
            cy={centre}
            r={maxRadius * r}
            fill="none"
            stroke="var(--color-brand)"
            strokeOpacity={r === 1 ? 0.28 : 0.12}
            strokeWidth={1}
          />
        ))}

        {/* Cross-hairs */}
        <line x1={centre} y1={centre - maxRadius} x2={centre} y2={centre + maxRadius}
          stroke="var(--color-brand)" strokeOpacity={0.1} strokeWidth={1} />
        <line x1={centre - maxRadius} y1={centre} x2={centre + maxRadius} y2={centre}
          stroke="var(--color-brand)" strokeOpacity={0.1} strokeWidth={1} />

        {/* Sweep */}
        <g className="ds-radar-sweep" style={{ transformOrigin: `${centre}px ${centre}px` }}>
          <path
            d={`M ${centre} ${centre} L ${centre + maxRadius} ${centre} A ${maxRadius} ${maxRadius} 0 0 0 ${centre + maxRadius * Math.cos(-Math.PI / 4)} ${centre + maxRadius * Math.sin(-Math.PI / 4)} Z`}
            fill="url(#radar-sweep-grad)"
          />
        </g>

        {/* Protected core */}
        <circle cx={centre} cy={centre} r={13} fill="var(--color-base)" stroke="var(--color-brand)" strokeWidth={1.5} />
        <circle cx={centre} cy={centre} r={4} fill="var(--color-brand)" />

        {/* Contacts */}
        {placed.map((c) => (
          <g
            key={c.label}
            onMouseEnter={() => setHovered(c.label)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={c.x} cy={c.y} r={7}
              fill={SEVERITY_COLOR[c.severity]}
              opacity={0.28}
              className="ds-ping"
              style={{ animationDelay: `${c.delay}s`, transformOrigin: `${c.x}px ${c.y}px` }}
            />
            <circle cx={c.x} cy={c.y} r={16} fill="transparent" />
            <circle
              cx={c.x} cy={c.y} r={hovered === c.label ? 5.5 : 4}
              fill={SEVERITY_COLOR[c.severity]}
              stroke="var(--color-base)"
              strokeWidth={1.5}
              className="transition-all"
            />
          </g>
        ))}
      </svg>

      {/* Contact label — only on hover, so the radar stays clean at rest */}
      {hovered && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <span className="rounded-md border border-line-strong bg-elevated px-2.5 py-1.5 text-[11px] shadow-xl">
            <span className="font-medium text-ink">{hovered}</span>
            <span className="ml-2 font-mono text-critical">
              {contacts.find((c) => c.label === hovered)?.count}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
