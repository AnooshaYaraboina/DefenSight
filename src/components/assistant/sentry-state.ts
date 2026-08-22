/**
 * Sentry's states, shared by both renderers.
 *
 * Lifted out of the component so the SVG fallback and the 3D rig read one
 * source of truth and neither has to import the other — the flat renderer must
 * stay free of any three.js reference, or the dock drags the whole library onto
 * every console route.
 */

export type SentryState =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "speaking"
  | "waiting"
  | "success"
  | "alarm"
  /* Asked for, rather than earned. Loops until told to stop, where "success"
     is a single celebratory beat at the end of a job. */
  | "dancing";

/** The design token each state speaks in. */
export const TONE: Record<SentryState, string> = {
  idle: "--color-brand",
  listening: "--color-accent",
  thinking: "--color-accent",
  working: "--color-accent",
  speaking: "--color-brand",
  waiting: "--color-medium",
  success: "--color-allow",
  alarm: "--color-critical",
  dancing: "--color-brand",
};

/**
 * Used only when a custom property reads empty — a canvas cannot fall back to
 * a CSS variable the way a stylesheet can, and a robot with no colour at all
 * is worse than one that is briefly the wrong blue.
 */
export const TONE_FALLBACK: Record<SentryState, string> = {
  idle: "#1c7ff0",
  listening: "#22d3ee",
  thinking: "#22d3ee",
  working: "#22d3ee",
  speaking: "#1c7ff0",
  waiting: "#fbbf24",
  success: "#2dd4bf",
  alarm: "#f43f5e",
  dancing: "#1c7ff0",
};

/** These play once and then hold. Re-entering one must restart it. */
export const ONE_SHOT: ReadonlySet<SentryState> = new Set<SentryState>(["success", "alarm"]);
