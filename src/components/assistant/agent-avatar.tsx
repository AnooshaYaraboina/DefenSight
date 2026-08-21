"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sentry — the assistant's body.
 *
 * A chat window with a spinner tells you something is happening. It does not
 * tell you *what*, and it gives you nothing to feel. Sentry does both: each
 * phase of a workflow has its own posture, so a glance says "still reading" or
 * "found something bad" before a single word is read.
 *
 * Deliberately a figure rather than a mascot. It has a stance, not a face —
 * no eyes, no mouth, no cuteness. A cartoon character would undercut a console
 * that exists to be believed about security, and an abstract orb would not
 * have given the user the performance they asked for. A small hooded sentry
 * splits the difference: it emotes through body language alone.
 *
 * Every animation is CSS on a transform. Nothing here re-renders per frame.
 */

export type AvatarState =
  | "idle"
  | "thinking"
  | "working"
  | "waiting"
  | "success"
  | "alarm";

const STATE_TONE: Record<AvatarState, { core: string; visor: string; glow: string }> = {
  idle: { core: "var(--color-brand)", visor: "var(--color-brand)", glow: "var(--color-brand)" },
  thinking: { core: "var(--color-accent)", visor: "var(--color-accent)", glow: "var(--color-accent)" },
  working: { core: "var(--color-accent)", visor: "var(--color-accent)", glow: "var(--color-accent)" },
  waiting: { core: "var(--color-medium)", visor: "var(--color-medium)", glow: "var(--color-medium)" },
  success: { core: "var(--color-allow)", visor: "var(--color-allow)", glow: "var(--color-allow)" },
  alarm: { core: "var(--color-critical)", visor: "var(--color-critical)", glow: "var(--color-critical)" },
};

export function AgentAvatar({
  state = "idle",
  size = 88,
  className,
}: {
  state?: AvatarState;
  size?: number;
  className?: string;
}) {
  const tone = STATE_TONE[state];

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: size, height: size }}
      data-state={state}
      role="img"
      aria-label={`Assistant is ${state}`}
    >
      {/* Ground shadow. It squashes as the figure rises, which is most of
          what sells a jump. */}
      <span
        className="ds-sentry-shadow absolute left-1/2 rounded-[50%]"
        style={{
          bottom: size * 0.06,
          width: size * 0.42,
          height: size * 0.055,
          marginLeft: -(size * 0.21),
          background: "color-mix(in oklab, var(--color-base) 80%, transparent)",
        }}
      />

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="ds-sentry relative"
        style={{ ["--sentry-glow" as string]: tone.glow }}
      >
        <defs>
          <linearGradient id="sentry-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-elevated)" />
            <stop offset="100%" stopColor="var(--color-surface)" />
          </linearGradient>
          <radialGradient id="sentry-halo">
            <stop offset="0%" stopColor={tone.glow} stopOpacity="0.30" />
            <stop offset="70%" stopColor={tone.glow} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Aura — grows with urgency, not with time. */}
        <circle className="ds-sentry-halo" cx="50" cy="46" r="42" fill="url(#sentry-halo)" />

        <g className="ds-sentry-body">
          {/* legs */}
          <g className="ds-sentry-leg ds-sentry-leg-l">
            <rect x="41" y="72" width="6" height="16" rx="3" fill="var(--color-line-strong)" />
          </g>
          <g className="ds-sentry-leg ds-sentry-leg-r">
            <rect x="53" y="72" width="6" height="16" rx="3" fill="var(--color-line-strong)" />
          </g>

          {/* arms — the main instrument of expression */}
          <g className="ds-sentry-arm ds-sentry-arm-l">
            <rect x="26" y="46" width="6" height="20" rx="3" fill="var(--color-line-strong)" />
          </g>
          <g className="ds-sentry-arm ds-sentry-arm-r">
            <rect x="68" y="46" width="6" height="20" rx="3" fill="var(--color-line-strong)" />
          </g>

          {/* torso */}
          <path
            d="M34 46 Q34 40 40 40 L60 40 Q66 40 66 46 L66 70 Q66 76 60 76 L40 76 Q34 76 34 70 Z"
            fill="url(#sentry-body)"
            stroke="var(--color-line-strong)"
            strokeWidth="1.5"
          />
          {/* chest core */}
          <circle
            className="ds-sentry-core"
            cx="50" cy="56" r="5"
            fill={tone.core}
          />

          {/* head + hood */}
          <g className="ds-sentry-head">
            <path
              d="M36 24 Q36 12 50 12 Q64 12 64 24 L64 34 Q64 40 58 40 L42 40 Q36 40 36 34 Z"
              fill="url(#sentry-body)"
              stroke="var(--color-line-strong)"
              strokeWidth="1.5"
            />
            {/* visor — the closest thing it has to a face */}
            <rect
              className="ds-sentry-visor"
              x="41" y="24" width="18" height="5" rx="2.5"
              fill={tone.visor}
            />
          </g>
        </g>
      </svg>

      {/* Thought motes. Only mounted while thinking, so they cost nothing the
          rest of the time. */}
      {state === "thinking" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="ds-sentry-mote absolute rounded-full"
              style={{
                width: 3 + i,
                height: 3 + i,
                left: `${58 + i * 9}%`,
                top: `${18 - i * 6}%`,
                background: tone.glow,
                animationDelay: `${i * 220}ms`,
              }}
            />
          ))}
        </span>
      )}

      {/* Work sparks — it is doing something, and something is coming off it. */}
      {state === "working" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="ds-sentry-spark absolute rounded-full"
              style={{
                width: 2.5,
                height: 2.5,
                left: `${20 + i * 15}%`,
                top: "52%",
                background: tone.glow,
                animationDelay: `${i * 140}ms`,
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
