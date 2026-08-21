"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sentry.
 *
 * The previous version was a 56px figure in a header beside a message list —
 * decoration next to the real interface. This one *is* the interface: it holds
 * the middle of the screen at full size, and the conversation happens with it
 * rather than beside it.
 *
 * It has a face, which the earlier one deliberately did not. That was the
 * wrong call for what this needs to be: speech has to come from somewhere, and
 * a mouth that moves while text appears is what makes a character read as
 * talking to you instead of a panel printing at you.
 *
 * Everything is CSS on transforms over an SVG. Nothing re-renders per frame.
 */

export type SentryState =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "speaking"
  | "waiting"
  | "success"
  | "alarm";

const TONE: Record<SentryState, string> = {
  idle: "var(--color-brand)",
  listening: "var(--color-accent)",
  thinking: "var(--color-accent)",
  working: "var(--color-accent)",
  speaking: "var(--color-brand)",
  waiting: "var(--color-medium)",
  success: "var(--color-allow)",
  alarm: "var(--color-critical)",
};

export function Sentry({
  state = "idle",
  size = 320,
  className,
}: {
  state?: SentryState;
  size?: number;
  className?: string;
}) {
  const tone = TONE[state];

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width: size, height: size * 1.18 }}
      data-sentry={state}
      role="img"
      aria-label={`Sentry is ${state}`}
    >
      {/* Floor light. It tightens as the figure rises, which is what sells
          height rather than drift. */}
      <span
        className="ds-sy-shadow absolute left-1/2 rounded-[50%]"
        style={{
          bottom: "1%",
          width: size * 0.46,
          height: size * 0.055,
          marginLeft: -(size * 0.23),
          background: `radial-gradient(ellipse, ${tone}44, transparent 70%)`,
        }}
      />

      <svg
        viewBox="0 0 200 236"
        width={size}
        height={size * 1.18}
        className="ds-sy relative overflow-visible"
        style={{ ["--sy" as string]: tone }}
      >
        <defs>
          <linearGradient id="sy-shell" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#2a2a38" />
            <stop offset="55%" stopColor="#1b1b26" />
            <stop offset="100%" stopColor="#12121a" />
          </linearGradient>
          <linearGradient id="sy-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#232331" />
            <stop offset="100%" stopColor="#15151f" />
          </linearGradient>
          <radialGradient id="sy-aura">
            <stop offset="35%" stopColor={tone} stopOpacity="0.22" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </radialGradient>
          <filter id="sy-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        <circle className="ds-sy-aura" cx="100" cy="104" r="92" fill="url(#sy-aura)" />

        <g className="ds-sy-all">
          {/* ------------------------------------------------------- legs */}
          <g className="ds-sy-leg ds-sy-leg-l">
            <rect x="80" y="176" width="13" height="34" rx="6.5" fill="url(#sy-plate)" stroke="#2e2e3d" strokeWidth="1.5" />
            <rect x="75" y="204" width="23" height="10" rx="5" fill="#2a2a38" />
          </g>
          <g className="ds-sy-leg ds-sy-leg-r">
            <rect x="107" y="176" width="13" height="34" rx="6.5" fill="url(#sy-plate)" stroke="#2e2e3d" strokeWidth="1.5" />
            <rect x="102" y="204" width="23" height="10" rx="5" fill="#2a2a38" />
          </g>

          {/* ------------------------------------------------------- arms */}
          <g className="ds-sy-arm ds-sy-arm-l">
            <rect x="44" y="104" width="13" height="46" rx="6.5" fill="url(#sy-plate)" stroke="#2e2e3d" strokeWidth="1.5" />
            <circle cx="50.5" cy="153" r="8" fill="#2a2a38" stroke="#35354a" strokeWidth="1.5" />
            <circle cx="50.5" cy="153" r="2.6" fill={tone} opacity="0.85" />
          </g>
          <g className="ds-sy-arm ds-sy-arm-r">
            <rect x="143" y="104" width="13" height="46" rx="6.5" fill="url(#sy-plate)" stroke="#2e2e3d" strokeWidth="1.5" />
            <circle cx="149.5" cy="153" r="8" fill="#2a2a38" stroke="#35354a" strokeWidth="1.5" />
            <circle cx="149.5" cy="153" r="2.6" fill={tone} opacity="0.85" />
          </g>

          {/* ------------------------------------------------------ torso */}
          <g className="ds-sy-torso">
            <path
              d="M62 108 Q62 96 76 96 L124 96 Q138 96 138 108 L138 168 Q138 182 124 182 L76 182 Q62 182 62 168 Z"
              fill="url(#sy-shell)"
              stroke="#33334a"
              strokeWidth="2"
            />
            {/* shoulder caps */}
            <circle cx="62" cy="110" r="12" fill="#22222f" stroke="#33334a" strokeWidth="1.5" />
            <circle cx="138" cy="110" r="12" fill="#22222f" stroke="#33334a" strokeWidth="1.5" />

            {/* chest core */}
            <circle cx="100" cy="132" r="19" fill="#0d0d14" stroke="#2e2e3d" strokeWidth="1.5" />
            <circle className="ds-sy-core-glow" cx="100" cy="132" r="13" fill={tone} opacity="0.20" filter="url(#sy-soft)" />
            <circle className="ds-sy-core" cx="100" cy="132" r="8.5" fill={tone} />
            <circle cx="100" cy="132" r="3.4" fill="#fff" opacity="0.75" />

            {/* vent lines */}
            <rect x="86" y="160" width="28" height="2.6" rx="1.3" fill="#2a2a38" />
            <rect x="90" y="166" width="20" height="2.6" rx="1.3" fill="#2a2a38" />
          </g>

          {/* ------------------------------------------------------- head */}
          <g className="ds-sy-head">
            {/* antenna */}
            <g className="ds-sy-antenna">
              <rect x="98.5" y="14" width="3" height="16" rx="1.5" fill="#2e2e3d" />
              <circle className="ds-sy-antenna-tip" cx="100" cy="12" r="5" fill={tone} />
              <circle cx="100" cy="12" r="9" fill={tone} opacity="0.22" filter="url(#sy-soft)" />
            </g>

            <path
              d="M64 44 Q64 28 82 28 L118 28 Q136 28 136 44 L136 74 Q136 90 118 90 L82 90 Q64 90 64 74 Z"
              fill="url(#sy-shell)"
              stroke="#33334a"
              strokeWidth="2"
            />
            {/* ear pods */}
            <rect x="57" y="52" width="8" height="20" rx="4" fill="#22222f" stroke="#33334a" strokeWidth="1.5" />
            <rect x="135" y="52" width="8" height="20" rx="4" fill="#22222f" stroke="#33334a" strokeWidth="1.5" />

            {/* visor well */}
            <rect x="72" y="42" width="56" height="26" rx="12" fill="#08080e" stroke="#2a2a38" strokeWidth="1.5" />

            {/* eyes */}
            <g className="ds-sy-eyes">
              <ellipse className="ds-sy-eye" cx="88" cy="55" rx="6.5" ry="7" fill={tone} />
              <ellipse className="ds-sy-eye" cx="112" cy="55" rx="6.5" ry="7" fill={tone} />
              <ellipse cx="90" cy="52.5" rx="2.2" ry="2.4" fill="#fff" opacity="0.9" />
              <ellipse cx="114" cy="52.5" rx="2.2" ry="2.4" fill="#fff" opacity="0.9" />
            </g>

            {/* mouth — the reason it reads as talking rather than printing */}
            <g className="ds-sy-mouth-group">
              <rect x="86" y="74" width="28" height="10" rx="5" fill="#08080e" stroke="#2a2a38" strokeWidth="1.2" />
              <rect className="ds-sy-mouth" x="89" y="76.5" width="22" height="5" rx="2.5" fill={tone} />
            </g>
          </g>
        </g>
      </svg>

      {/* Thought motes, only while thinking. */}
      {state === "thinking" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="ds-sy-mote absolute rounded-full"
              style={{
                width: 5 + i * 2,
                height: 5 + i * 2,
                left: `${64 + i * 8}%`,
                top: `${14 - i * 4}%`,
                background: tone,
                animationDelay: `${i * 260}ms`,
              }}
            />
          ))}
        </span>
      )}

      {/* Sparks while it works. */}
      {state === "working" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="ds-sy-spark absolute rounded-full"
              style={{
                width: 4,
                height: 4,
                left: `${18 + i * 13}%`,
                top: "60%",
                background: tone,
                animationDelay: `${i * 130}ms`,
              }}
            />
          ))}
        </span>
      )}

      {/* Confetti on a win. */}
      {state === "success" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span
              key={i}
              className="ds-sy-confetti absolute"
              style={{
                width: 5,
                height: 9,
                left: `${16 + i * 9.5}%`,
                top: "26%",
                background: i % 3 === 0 ? "var(--color-allow)" : i % 3 === 1 ? "var(--color-brand)" : "var(--color-accent)",
                animationDelay: `${i * 70}ms`,
                borderRadius: 1,
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
