"use client";

import * as React from "react";
import { TONE, type SentryState } from "./sentry-state";
import { cn } from "@/lib/utils";

/**
 * Sentry.
 *
 * Same character, properly rendered. The previous version was 33 flat shapes,
 * three gradients and a single blur — no rim light, no seams, no joints, and
 * arms that rotated as rigid sticks. It read as a wireframe of a robot rather
 * than a robot.
 *
 * The changes that carry the weight, in order:
 *
 *   Rim light. A bright edge down the upper-left of every major mass and a
 *   cooler bounce on the lower-right. On a dark ground this is most of what
 *   separates a lit object from a filled silhouette.
 *
 *   Elbows. Each arm is now upper + forearm about a joint, so a swing bends.
 *   This matters more at slow speeds than fast ones — a rigid stick moving
 *   slowly looks broken, a jointed arm moving slowly looks deliberate.
 *
 *   Glass over the visor, seams across the shell, and light bleeding out of
 *   the joints, so the body reads as a housing with something lit inside it.
 *
 * Everything animates via CSS on transforms. React never renders a frame.
 */



export function SentrySvg({
  state = "idle",
  size = 320,
  className,
}: {
  state?: SentryState;
  size?: number;
  className?: string;
}) {
  const tone = TONE[state];
  const uid = React.useId().replace(/[:]/g, "");
  const id = (name: string) => `${name}-${uid}`;

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width: size, height: size * 1.18 }}
      data-sentry={state}
      role="img"
      aria-label={`Sentry is ${state}`}
    >
      {/* Contact shadow: a tight dark core under the feet plus a wider soft
          spill. One blob reads as a sticker; two read as an object on a floor. */}
      <span
        className="ds-sy-shadow absolute left-1/2 rounded-[50%]"
        style={{
          bottom: "1.5%",
          width: size * 0.34,
          height: size * 0.042,
          marginLeft: -(size * 0.17),
          background: "radial-gradient(ellipse, rgba(0,0,0,0.85), rgba(0,0,0,0.35) 55%, transparent 75%)",
        }}
      />
      <span
        className="ds-sy-shadow absolute left-1/2 rounded-[50%]"
        style={{
          bottom: "0.5%",
          width: size * 0.5,
          height: size * 0.06,
          marginLeft: -(size * 0.25),
          background: `radial-gradient(ellipse, ${tone}33, transparent 70%)`,
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
          {/* Shell: lit from upper-left, falling to near-black at the base. */}
          <linearGradient id={id("shell")} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#3a3a4d" />
            <stop offset="28%" stopColor="#262633" />
            <stop offset="70%" stopColor="#181822" />
            <stop offset="100%" stopColor="#0f0f16" />
          </linearGradient>
          <linearGradient id={id("plate")} x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#32323f" />
            <stop offset="45%" stopColor="#20202b" />
            <stop offset="100%" stopColor="#131319" />
          </linearGradient>
          {/* Rim light down the leading edge. */}
          <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* Cool bounce coming back off the floor. */}
          <linearGradient id={id("bounce")} x1="1" y1="1" x2="0.2" y2="0.2">
            <stop offset="0%" stopColor={tone} stopOpacity="0.35" />
            <stop offset="45%" stopColor={tone} stopOpacity="0.06" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
          {/* Visor glass. */}
          <linearGradient id={id("glass")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id("sweep")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id("aura")}>
            <stop offset="30%" stopColor={tone} stopOpacity="0.26" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </radialGradient>
          {/* Light escaping a joint. */}
          <radialGradient id={id("joint")}>
            <stop offset="0%" stopColor={tone} stopOpacity="0.75" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("beam")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.45" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>

          <filter id={id("soft")} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id={id("glow")} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          {/* Head casts onto the torso, which is what puts it in front. */}
          <filter id={id("cast")} x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.55" />
          </filter>
          <clipPath id={id("visorClip")}>
            <rect x="72" y="42" width="56" height="26" rx="12" />
          </clipPath>
        </defs>

        <circle className="ds-sy-aura" cx="100" cy="104" r="92" fill={`url(#${id("aura")})`} />

        {/* Scanning beam — only rendered while working. */}
        <g className="ds-sy-beam" opacity="0">
          <path d="M78 66 L58 210 L142 210 L122 66 Z" fill={`url(#${id("beam")})`} />
        </g>

        <g className="ds-sy-all">
          {/* ------------------------------------------------------- legs */}
          {[
            { k: "l", x: 80, foot: 75 },
            { k: "r", x: 107, foot: 102 },
          ].map((leg) => (
            <g key={leg.k} className={`ds-sy-leg ds-sy-leg-${leg.k}`}>
              <circle cx={leg.x + 6.5} cy={178} r={9} fill={`url(#${id("joint")})`} opacity="0.5" />
              <rect x={leg.x} y="176" width="13" height="34" rx="6.5" fill={`url(#${id("plate")})`} stroke="#3a3a4d" strokeWidth="1.2" />
              <rect x={leg.x + 1} y="177" width="3" height="31" rx="1.5" fill={`url(#${id("rim")})`} />
              <rect x={leg.foot} y="204" width="23" height="10" rx="5" fill="#26262f" stroke="#3a3a4d" strokeWidth="1" />
            </g>
          ))}

          {/* ------------------------------------------------------- arms
              Two segments about an elbow. A slow swing on a rigid stick looks
              broken; the same swing with a joint looks considered. */}
          <g className="ds-sy-arm ds-sy-arm-l">
            <circle cx="50.5" cy="110" r="10" fill={`url(#${id("joint")})`} opacity="0.55" />
            <rect x="44" y="104" width="13" height="26" rx="6.5" fill={`url(#${id("plate")})`} stroke="#3a3a4d" strokeWidth="1.2" />
            <rect x="45" y="105" width="3" height="24" rx="1.5" fill={`url(#${id("rim")})`} />
            <g className="ds-sy-fore ds-sy-fore-l">
              <rect x="44.5" y="128" width="12" height="26" rx="6" fill={`url(#${id("plate")})`} stroke="#3a3a4d" strokeWidth="1.2" />
              <rect x="45.5" y="129" width="2.6" height="24" rx="1.3" fill={`url(#${id("rim")})`} />
              <circle cx="50.5" cy="157" r="8" fill="#26262f" stroke="#3f3f52" strokeWidth="1.2" />
              <circle className="ds-sy-palm" cx="50.5" cy="157" r="2.8" fill={tone} />
            </g>
          </g>
          <g className="ds-sy-arm ds-sy-arm-r">
            <circle cx="149.5" cy="110" r="10" fill={`url(#${id("joint")})`} opacity="0.55" />
            <rect x="143" y="104" width="13" height="26" rx="6.5" fill={`url(#${id("plate")})`} stroke="#3a3a4d" strokeWidth="1.2" />
            <rect x="144" y="105" width="3" height="24" rx="1.5" fill={`url(#${id("rim")})`} />
            <g className="ds-sy-fore ds-sy-fore-r">
              <rect x="143.5" y="128" width="12" height="26" rx="6" fill={`url(#${id("plate")})`} stroke="#3a3a4d" strokeWidth="1.2" />
              <rect x="144.5" y="129" width="2.6" height="24" rx="1.3" fill={`url(#${id("rim")})`} />
              <circle cx="149.5" cy="157" r="8" fill="#26262f" stroke="#3f3f52" strokeWidth="1.2" />
              <circle className="ds-sy-palm" cx="149.5" cy="157" r="2.8" fill={tone} />
            </g>
          </g>

          {/* ------------------------------------------------------ torso */}
          <g className="ds-sy-torso">
            <path
              d="M62 108 Q62 96 76 96 L124 96 Q138 96 138 108 L138 168 Q138 182 124 182 L76 182 Q62 182 62 168 Z"
              fill={`url(#${id("shell")})`}
              stroke="#3f3f52"
              strokeWidth="1.6"
            />
            {/* rim + bounce */}
            <path d="M62 108 Q62 96 76 96 L94 96 L94 100 L78 100 Q66 100 66 110 L66 170 L62 170 Z" fill={`url(#${id("rim")})`} />
            <path d="M138 168 Q138 182 124 182 L92 182 L92 178 L122 178 Q134 178 134 166 L134 112 L138 112 Z" fill={`url(#${id("bounce")})`} />

            {/* seams */}
            <path d="M100 96 L100 113" stroke="#0f0f16" strokeWidth="1.2" opacity="0.75" />
            <path d="M70 150 L130 150" stroke="#0f0f16" strokeWidth="1" opacity="0.5" />

            <circle cx="62" cy="110" r="12" fill="#22222f" stroke="#3f3f52" strokeWidth="1.4" />
            <circle cx="138" cy="110" r="12" fill="#22222f" stroke="#3f3f52" strokeWidth="1.4" />
            <path d="M53 104 A12 12 0 0 1 62 98" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.6" fill="none" />
            <path d="M129 104 A12 12 0 0 1 138 98" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.4" fill="none" />

            {/* core */}
            <circle cx="100" cy="132" r="19" fill="#0a0a11" stroke="#33334a" strokeWidth="1.4" />
            <circle className="ds-sy-core-glow" cx="100" cy="132" r="14" fill={tone} opacity="0.28" filter={`url(#${id("soft")})`} />
            <circle className="ds-sy-core" cx="100" cy="132" r="8.5" fill={tone} filter={`url(#${id("glow")})`} />
            <circle cx="97.5" cy="129" r="3" fill="#fff" opacity="0.8" />

            <rect x="86" y="160" width="28" height="2.6" rx="1.3" fill="#0f0f16" />
            <rect x="90" y="166" width="20" height="2.6" rx="1.3" fill="#0f0f16" />
          </g>

          {/* Shield — alarm only. */}
          <g className="ds-sy-shield" opacity="0">
            <path
              d="M100 88 L134 104 L134 142 Q134 168 100 182 Q66 168 66 142 L66 104 Z"
              fill={tone}
              fillOpacity="0.10"
              stroke={tone}
              strokeWidth="2"
              strokeOpacity="0.8"
            />
          </g>

          {/* ------------------------------------------------------- head */}
          <g className="ds-sy-head" filter={`url(#${id("cast")})`}>
            <g className="ds-sy-antenna">
              <rect x="98.5" y="14" width="3" height="16" rx="1.5" fill="#33334a" />
              <circle className="ds-sy-antenna-tip" cx="100" cy="12" r="5" fill={tone} filter={`url(#${id("glow")})`} />
            </g>

            <path
              d="M64 44 Q64 28 82 28 L118 28 Q136 28 136 44 L136 74 Q136 90 118 90 L82 90 Q64 90 64 74 Z"
              fill={`url(#${id("shell")})`}
              stroke="#3f3f52"
              strokeWidth="1.6"
            />
            <path d="M64 44 Q64 28 82 28 L98 28 L98 32 L84 32 Q68 32 68 46 L68 76 L64 76 Z" fill={`url(#${id("rim")})`} />
            <path d="M136 74 Q136 90 118 90 L96 90 L96 86 L116 86 Q132 86 132 72 L132 48 L136 48 Z" fill={`url(#${id("bounce")})`} />
            <path d="M100 28 L100 42" stroke="#0f0f16" strokeWidth="1.2" opacity="0.6" />

            <rect x="57" y="52" width="8" height="20" rx="4" fill="#22222f" stroke="#3f3f52" strokeWidth="1.2" />
            <rect x="135" y="52" width="8" height="20" rx="4" fill="#22222f" stroke="#3f3f52" strokeWidth="1.2" />

            {/* visor */}
            <rect x="72" y="42" width="56" height="26" rx="12" fill="#06060b" stroke="#33334a" strokeWidth="1.4" />
            <g className="ds-sy-eyes">
              <ellipse className="ds-sy-eye" cx="88" cy="55" rx="6.5" ry="7" fill={tone} filter={`url(#${id("glow")})`} />
              <ellipse className="ds-sy-eye" cx="112" cy="55" rx="6.5" ry="7" fill={tone} filter={`url(#${id("glow")})`} />
              <ellipse cx="90" cy="52.5" rx="2.2" ry="2.4" fill="#fff" opacity="0.92" />
              <ellipse cx="114" cy="52.5" rx="2.2" ry="2.4" fill="#fff" opacity="0.92" />
            </g>
            {/* glass over the top, plus a reflection that crosses it slowly */}
            <g clipPath={`url(#${id("visorClip")})`}>
              <rect x="72" y="42" width="56" height="26" fill={`url(#${id("glass")})`} />
              <rect className="ds-sy-gloss" x="-40" y="42" width="34" height="26" fill={`url(#${id("sweep")})`} />
            </g>

            <g className="ds-sy-mouth-group">
              <rect x="86" y="74" width="28" height="10" rx="5" fill="#06060b" stroke="#33334a" strokeWidth="1.1" />
              <rect className="ds-sy-mouth" x="89" y="76.5" width="22" height="5" rx="2.5" fill={tone} />
            </g>
          </g>

          {/* Thinking ring, orbiting the head. */}
          <g className="ds-sy-ring" opacity="0">
            <ellipse cx="100" cy="58" rx="52" ry="15" fill="none" stroke={tone} strokeWidth="1.6" strokeOpacity="0.55" strokeDasharray="5 9" />
          </g>
        </g>
      </svg>

      {state === "thinking" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="ds-sy-mote absolute rounded-full"
              style={{
                width: 5 + i * 2, height: 5 + i * 2,
                left: `${64 + i * 8}%`, top: `${14 - i * 4}%`,
                background: tone, animationDelay: `${i * 380}ms`,
              }}
            />
          ))}
        </span>
      )}

      {state === "working" && (
        <span className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="ds-sy-spark absolute rounded-full"
              style={{
                width: 4, height: 4,
                left: `${18 + i * 13}%`, top: "60%",
                background: tone, animationDelay: `${i * 260}ms`,
              }}
            />
          ))}
        </span>
      )}

      {(state === "success" || state === "dancing") && <Poppers looping={state === "dancing"} />}

    </div>
  );
}

/* ========================================================================== *
 * Party poppers
 * ========================================================================== */

/**
 * Two poppers, firing arcs.
 *
 * Confetti that simply falls from above is snow, and it lands on top of the
 * character. These are cannons at the lower corners angled up and *outward*,
 * so the two fans diverge from the moment they leave the muzzle: they never
 * cross each other and they never cross Sentry, who stays fully visible in the
 * gap between them.
 *
 * Trajectories are computed here, deterministically from the index — no
 * randomness, so a re-render never reshuffles a burst mid-flight, and the
 * compiler's purity rule stays satisfied. Each piece is three nested spans
 * because the axes need different easing: horizontal travel is linear, while
 * vertical has to rise, hang and fall.
 */
function Poppers({ looping }: { looping: boolean }) {
  const PER_SIDE = 16;

  // overflow must stay visible: the whole point is that pieces travel well
  // outside this box. Clipping them here made the burst invisible.
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {[-1, 1].map((dir) => (
        <span
          key={dir}
          className="ds-pop-mount absolute"
          style={{
            [dir < 0 ? "left" : "right"]: "-2%",
            bottom: "9%",
            ["--pr" as string]: `${dir * 34}deg`,
          }}
        >
          {/* muzzle flash */}
          <span className="ds-pop-flash absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full" />

          {/* Only the cone is angled. Rotating the mount would rotate every
              particle's trajectory with it, adding the tilt a second time on
              top of the one already baked into each vector. */}
          <span className="ds-pop-body block" style={{ transform: `rotate(${dir * 34}deg)` }} />

          {Array.from({ length: PER_SIDE }, (_, i) => {
            // Fan the pieces across the muzzle, biased upward and outward so
            // the two sides open away from each other.
            const t = i / (PER_SIDE - 1);
            // Kept under 90° so the horizontal component never goes negative:
            // every piece travels away from centre, which is what guarantees
            // the two fans cannot cross each other or the figure between them.
            const angle = 40 + t * 46;                 // 40°–86° from horizontal
            const reach = 210 + (i % 4) * 60;          // stagger so they do not wall up
            const rad = (angle * Math.PI) / 180;
            const px = dir * Math.cos(rad) * reach;    // outward
            const py = -Math.sin(rad) * reach;         // up
            const colour =
              i % 3 === 0 ? "var(--color-allow)"
                : i % 3 === 1 ? "var(--color-brand)"
                : "var(--color-accent)";

            return (
              <span
                key={i}
                className="ds-pop-x absolute left-0 top-0"
                style={{
                  ["--px" as string]: `${px}px`,
                  animationDelay: `${i * 14 + (dir > 0 ? 40 : 0)}ms`,
                  animationIterationCount: looping ? "infinite" : 1,
                }}
              >
                <span
                  className="ds-pop-y block"
                  style={{
                    ["--py" as string]: `${py}px`,
                    ["--pfall" as string]: `${reach + 210}px`,
                    animationDelay: `${i * 14 + (dir > 0 ? 40 : 0)}ms`,
                    animationIterationCount: looping ? "infinite" : 1,
                  }}
                >
                  <span
                    className="ds-pop-piece block"
                    style={{
                      background: colour,
                      width: i % 4 === 0 ? 4 : 5,
                      height: i % 4 === 0 ? 10 : 7,
                      ["--protate" as string]: `${(i % 2 ? 1 : -1) * (430 + i * 50)}deg`,
                      animationDelay: `${i * 14 + (dir > 0 ? 40 : 0)}ms`,
                      animationIterationCount: looping ? "infinite" : 1,
                    }}
                  />
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}
