/**
 * The motion primitives.
 *
 * Four layers, none of which is an AnimationMixer. Nine clips authored as
 * keyframe literals would give no interruptibility without manual crossfade
 * bookkeeping, and no clean way to lay a loop over a pose. This is smaller and
 * does more:
 *
 *   1. Base       — always on. Float, breathe, blink, saccade. What makes the
 *                   character alive even in a state defined by stillness.
 *   2. Posture    — a critically damped spring per channel. A state change
 *                   rewrites targets; every transition is therefore smooth and
 *                   interruptible mid-flight for free.
 *   3. Performance— additive oscillators, faded in and out by their own spring
 *                   so a loop never pops on or off.
 *   4. Timeline   — hand-authored one-shots. A spring physically cannot produce
 *                   a sharp hit-and-settle; a startle needs one.
 */

/**
 * Critically damped approach. Frame-rate independent and never overshoots,
 * which matters because an overshooting elbow reads as a broken joint rather
 * than a springy one.
 */
export class Spring {
  value: number;
  target: number;
  private velocity = 0;

  constructor(initial = 0, private smoothTime = 0.28) {
    this.value = initial;
    this.target = initial;
  }

  /** Jump without easing — used when a rig is first built. */
  set(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  step(dt: number): number {
    const omega = 2 / this.smoothTime;
    const x = omega * dt;
    // Pade approximation of exp(-x); cheaper and stable at large dt.
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - this.target;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    this.value = this.target + (change + temp) * exp;
    return this.value;
  }
}

/** Every channel the performances can address. */
export type ChannelName =
  | "hoverY" | "torsoLean" | "torsoTwist" | "hipSway"
  | "headPitch" | "headYaw" | "headRoll"
  | "armLPitch" | "armRPitch" | "armLRoll" | "armRRoll"
  | "elbowL" | "elbowR"
  | "legLPitch" | "legRPitch" | "kneeL" | "kneeR"
  | "eyeIntensity" | "coreIntensity" | "tipIntensity" | "mouthOpen"
  | "rootSpin" | "scale";

export type Channels = Record<ChannelName, Spring>;

const CHANNEL_NAMES: ChannelName[] = [
  "hoverY", "torsoLean", "torsoTwist", "hipSway",
  "headPitch", "headYaw", "headRoll",
  "armLPitch", "armRPitch", "armLRoll", "armRRoll",
  "elbowL", "elbowR",
  "legLPitch", "legRPitch", "kneeL", "kneeR",
  "eyeIntensity", "coreIntensity", "tipIntensity", "mouthOpen",
  "rootSpin", "scale",
];

export function createChannels(): Channels {
  const c = {} as Channels;
  for (const n of CHANNEL_NAMES) {
    c[n] = new Spring(n === "scale" || n.endsWith("Intensity") ? 1 : 0);
  }
  c.eyeIntensity.set(1);
  c.coreIntensity.set(1);
  c.tipIntensity.set(1);
  c.scale.set(1);
  return c;
}

export function stepChannels(c: Channels, dt: number): void {
  for (const n of CHANNEL_NAMES) c[n].step(dt);
}

/** Sum of incommensurate sines — never repeats, so it never reads as a loop. */
export function noise(t: number, a: number, b: number, c: number): number {
  return (Math.sin(t * a) + Math.sin(t * b * 1.37) + Math.sin(t * c * 0.71)) / 3;
}

/** A scheduler for events that should feel involuntary rather than metronomic. */
export class Intermittent {
  private next: number;
  constructor(private min: number, private max: number, start = 0) {
    this.next = start + min + Math.random() * (max - min);
  }
  /** True exactly once per interval. */
  due(t: number): boolean {
    if (t < this.next) return false;
    this.next = t + this.min + Math.random() * (this.max - this.min);
    return true;
  }
}

/** Piecewise curve over a fixed duration, for the one-shots. */
export class Timeline {
  private t0 = -Infinity;
  constructor(readonly duration: number) {}

  /** Restarting on re-entry is the point: two alarms in a row must both play. */
  restart(now: number): void {
    this.t0 = now;
  }

  /** 0..1 while running, or null when finished. */
  progress(now: number): number | null {
    const p = (now - this.t0) / this.duration;
    return p >= 0 && p <= 1 ? p : null;
  }

  get running(): boolean {
    return this.t0 > -Infinity;
  }
}

/** Ease helpers used by the timelines. */
export const ease = {
  outCubic: (p: number) => 1 - Math.pow(1 - p, 3),
  inCubic: (p: number) => p * p * p,
  outBack: (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2),
  /** Decaying oscillation — the settle after a hit. */
  damped: (p: number, cycles = 3, decay = 6) =>
    Math.cos(p * Math.PI * 2 * cycles) * Math.exp(-decay * p),
};

/** Linear interpolation between keyed stops, for hand-authored curves. */
export function keyed(p: number, stops: [number, number][]): number {
  if (p <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, v1] = stops[i];
    if (p <= t1) {
      const [t0, v0] = stops[i - 1];
      const k = (p - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * ease.outCubic(k);
    }
  }
  return stops[stops.length - 1][1];
}
