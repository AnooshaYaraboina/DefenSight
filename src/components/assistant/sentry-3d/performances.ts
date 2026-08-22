import type { SentryState } from "../sentry-state";
import { ease, keyed, noise, type Channels } from "./anim";

/**
 * The nine states.
 *
 * The rule they are designed against: **no two may share a silhouette.** The
 * flat character distinguished its states almost entirely by tint, which is why
 * nine of them read as one. Here, three states are defined by where the hands
 * and head are, three by the rate of motion, and three by whole-body events —
 * and colour is a consequence rather than the signal.
 *
 * Each performance writes spring *targets* (the pose it settles into) and
 * returns additive offsets (the motion laid over that pose). The caller blends
 * the additive half in and out, so entering and leaving a loop never pops.
 */

export interface Additive {
  hoverY?: number;
  torsoLean?: number;
  torsoTwist?: number;
  hipSway?: number;
  headPitch?: number;
  headYaw?: number;
  headRoll?: number;
  armLPitch?: number;
  armRPitch?: number;
  elbowL?: number;
  elbowR?: number;
  legLPitch?: number;
  legRPitch?: number;
  kneeL?: number;
  kneeR?: number;
  coreIntensity?: number;
  eyeIntensity?: number;
  tipIntensity?: number;
  mouthOpen?: number;
  rootSpin?: number;
  scale?: number;
}

/** Fixtures a state switches on. */
export interface Fixtures {
  scanRing: boolean;
  scanBeam: boolean;
  shield: boolean;
  confetti: boolean;
}

const NO_FIXTURES: Fixtures = { scanRing: false, scanBeam: false, shield: false, confetti: false };

export interface Performance {
  /** The settled pose. Written once on entry, then held by the springs. */
  pose(c: Channels): void;
  /** Motion laid over the pose, evaluated every frame. */
  motion(t: number): Additive;
  fixtures: Fixtures;
  /** One-shots declare a duration; loops return null. */
  duration: number | null;
}

const D = Math.PI / 180;

/* ------------------------------------------------------------------ idle */
const idle: Performance = {
  pose(c) {
    c.torsoLean.target = 0;
    c.headPitch.target = 0;
    c.armLPitch.target = 4 * D;
    c.armRPitch.target = -4 * D;
    c.elbowL.target = -8 * D;
    c.elbowR.target = -8 * D;
    c.legLPitch.target = 0;
    c.legRPitch.target = 0;
    c.hoverY.target = 0.04;
    c.eyeIntensity.target = 1;
    c.coreIntensity.target = 1;
    c.mouthOpen.target = 0.12;
  },
  motion(t) {
    return {
      hoverY: Math.sin(t / 5.5 * Math.PI * 2) * 0.06,
      headYaw: noise(t * 0.11, 1, 0.6, 0.3) * 5 * D,
      headRoll: noise(t * 0.09, 0.7, 1.1, 0.5) * 2 * D,
      /* A slow chest breath, out of phase with the float so the two never
         line up into one bigger bob. */
      coreIntensity: 0.14 * Math.sin(t / 5 * Math.PI * 2 + 1.1),
      armLPitch: Math.sin(t / 5.5 * Math.PI * 2 + 0.4) * 1.6 * D,
      armRPitch: -Math.sin(t / 5.5 * Math.PI * 2 + 0.4) * 1.6 * D,
    };
  },
  fixtures: NO_FIXTURES,
  duration: null,
};

/* ------------------------------------------------------------- listening */
/* Leans in and cocks its head. Reading a posture as attention is much faster
   than reading a colour as attention. */
const listening: Performance = {
  pose(c) {
    c.torsoLean.target = 8 * D;
    c.headPitch.target = -4 * D;
    c.headRoll.target = 13 * D;
    c.headYaw.target = -6 * D;
    c.armLPitch.target = 6 * D;
    c.armRPitch.target = -34 * D;
    c.elbowR.target = -52 * D;
    c.eyeIntensity.target = 1.4;
    c.coreIntensity.target = 1.15;
    c.mouthOpen.target = 0.1;
  },
  motion(t) {
    return {
      hoverY: Math.sin(t / 3.2 * Math.PI * 2) * 0.035,
      /* A fast, tiny quiver on the antenna — the tell that something is
         actively receiving. */
      tipIntensity: 0.3 * Math.sin(t * 9),
      headRoll: Math.sin(t / 3.2 * Math.PI * 2) * 1.5 * D,
      coreIntensity: 0.2 * Math.sin(t / 2.2 * Math.PI * 2),
    };
  },
  fixtures: NO_FIXTURES,
  duration: null,
};

/* -------------------------------------------------------------- thinking */
/* Hand to chin, head down and rolled, weight on one leg. Eyes dim and flicker,
   because thinking means not looking at you. */
const thinking: Performance = {
  pose(c) {
    c.torsoLean.target = 3 * D;
    c.headPitch.target = 14 * D;
    c.headRoll.target = -10 * D;
    c.headYaw.target = -12 * D;
    c.armRPitch.target = -78 * D;
    c.armRRoll.target = -18 * D;
    c.elbowR.target = -100 * D;
    c.armLPitch.target = 8 * D;
    c.elbowL.target = -22 * D;
    c.legLPitch.target = -5 * D;
    c.legRPitch.target = 3 * D;
    c.eyeIntensity.target = 0.6;
    c.coreIntensity.target = 1.1;
    c.mouthOpen.target = 0.06;
  },
  motion(t) {
    return {
      hoverY: Math.sin(t / 4.6 * Math.PI * 2) * 0.04,
      hipSway: Math.sin(t / 4.6 * Math.PI * 2) * 0.05,
      headYaw: Math.sin(t / 4.6 * Math.PI * 2) * 4 * D,
      /* Stochastic flicker, not a pulse — a mind wandering rather than a
         machine ticking. */
      eyeIntensity: noise(t * 1.7, 3, 5, 8) * 0.28,
      coreIntensity: 0.16 * Math.sin(t / 1.7 * Math.PI * 2),
    };
  },
  fixtures: { ...NO_FIXTURES, scanRing: true },
  duration: null,
};

/* --------------------------------------------------------------- working */
/* The busiest silhouette: both arms pumping in antiphase, legs marching, the
   whole body bobbing at twice the arm rate, and a beam sweeping the floor. */
const working: Performance = {
  pose(c) {
    c.torsoLean.target = 4 * D;
    c.headPitch.target = 6 * D;
    c.eyeIntensity.target = 1.2;
    c.coreIntensity.target = 1.3;
    c.mouthOpen.target = 0.2;
    c.elbowL.target = -46 * D;
    c.elbowR.target = -46 * D;
  },
  motion(t) {
    const cycle = (t / 1.5) * Math.PI * 2;
    return {
      armLPitch: Math.sin(cycle) * 34 * D,
      armRPitch: -Math.sin(cycle) * 34 * D,
      /* The forearm lags the upper arm by a fifth of a cycle. That delay is
         the entire reason the joint reads as an elbow. */
      elbowL: Math.sin(cycle - 1.2) * 18 * D,
      elbowR: Math.sin(cycle - 1.2) * 18 * D,
      legLPitch: Math.sin(cycle) * 14 * D,
      legRPitch: -Math.sin(cycle) * 14 * D,
      kneeL: Math.max(0, -Math.sin(cycle)) * 22 * D,
      kneeR: Math.max(0, Math.sin(cycle)) * 22 * D,
      hoverY: Math.abs(Math.sin(cycle)) * 0.045,
      torsoTwist: Math.sin(cycle) * 5 * D,
      /* The chest strobes in phase with the effort. */
      coreIntensity: 0.4 * Math.abs(Math.sin(cycle)),
      headYaw: Math.sin(t / 3.2 * Math.PI * 2) * 8 * D,
    };
  },
  fixtures: { ...NO_FIXTURES, scanBeam: true },
  duration: null,
};

/* -------------------------------------------------------------- speaking */
const speaking: Performance = {
  pose(c) {
    c.torsoLean.target = 1 * D;
    c.headPitch.target = -2 * D;
    c.armLPitch.target = 10 * D;
    c.armRPitch.target = -10 * D;
    c.elbowL.target = -30 * D;
    c.elbowR.target = -30 * D;
    c.eyeIntensity.target = 1.15;
    c.coreIntensity.target = 1.05;
  },
  motion(t) {
    /* The mouth is five segments a few millimetres wide. On its own it is
       invisible from any normal viewing distance, so speech has to be carried
       by the body: hands that gesture on the beat, and a head that moves with
       the sentence. */
    return {
      hoverY: Math.sin(t / 2.4 * Math.PI * 2) * 0.055,
      headYaw: noise(t * 0.6, 1, 1.6, 2.3) * 13 * D,
      /* An accent nod on an irregular beat, so it reads as emphasis rather
         than a tic. */
      headPitch: Math.max(0, Math.sin(t * 3.1)) * 9 * D,
      headRoll: noise(t * 0.4, 1.2, 0.8, 1.9) * 6 * D,
      /* Hands beat outward alternately — the single most legible "this one is
         talking" cue at a glance. */
      armLPitch: -22 * D + Math.sin(t * 2.6) * 20 * D,
      armRPitch: 22 * D - Math.sin(t * 2.6 + 1.1) * 20 * D,
      elbowL: -18 * D + Math.sin(t * 2.6 - 0.7) * 16 * D,
      elbowR: -18 * D - Math.sin(t * 2.6 + 0.4) * 16 * D,
      torsoTwist: Math.sin(t * 1.3) * 5 * D,
      mouthOpen: 0.5 + 0.5 * noise(t * 6, 3, 7, 11),
    };
  },
  fixtures: NO_FIXTURES,
  duration: null,
};

/* --------------------------------------------------------------- waiting */
/* Defined by stillness. Arms down, weight settled, looking straight down the
   lens — and one thing moving: the antenna, square-waving like a status light.
   One moving part on an otherwise motionless body reads as "your turn" far
   more clearly than any amount of activity. */
const waiting: Performance = {
  pose(c) {
    /* Parked, not merely calm. Settled onto the floor with the knees slightly
       bent, arms clasped in front and the head level — a posture no other
       state uses, so stillness reads as waiting rather than as idle standing
       unusually quietly. */
    c.hoverY.target = -0.07;
    c.torsoLean.target = 2 * D;
    c.headPitch.target = 3 * D;
    c.headYaw.target = 0;
    c.headRoll.target = 0;
    c.armLPitch.target = -34 * D;
    c.armRPitch.target = -34 * D;
    c.armLRoll.target = 16 * D;
    c.armRRoll.target = -16 * D;
    c.elbowL.target = -58 * D;
    c.elbowR.target = -58 * D;
    c.legLPitch.target = 0;
    c.legRPitch.target = 0;
    c.kneeL.target = 7 * D;
    c.kneeR.target = 7 * D;
    c.eyeIntensity.target = 0.85;
    c.coreIntensity.target = 0.7;
    c.mouthOpen.target = 0.08;
  },
  motion(t) {
    return {
      hoverY: Math.sin(t / 6 * Math.PI * 2) * 0.016,
      /* One moving part on a motionless body. A status light waiting for
         input says "your turn" far more clearly than any amount of activity. */
      tipIntensity: Math.sin(t * 3.45) > 0 ? 1.2 : -0.8,
    };
  },
  fixtures: NO_FIXTURES,
  duration: null,
};

/* --------------------------------------------------------------- success */
const success: Performance = {
  pose(c) {
    c.eyeIntensity.target = 1.5;
    c.coreIntensity.target = 1.4;
    c.mouthOpen.target = 0.9;
  },
  motion(t) {
    return { hoverY: Math.sin(t * 2) * 0.02 };
  },
  fixtures: { ...NO_FIXTURES, confetti: true },
  duration: 2.6,
};

/** Success is a curve, not a loop — crouch, leap, spin at the apex, land. */
export function successTimeline(p: number): Additive {
  const lift = keyed(p, [
    [0, 0], [0.08, -0.09], [0.32, 1.05], [0.5, 1.15],
    [0.68, 0], [0.76, -0.07], [0.86, 0.12], [1, 0],
  ]);
  const squash = keyed(p, [
    [0, 1], [0.08, 0.88], [0.2, 1.06], [0.6, 1], [0.7, 0.86], [0.82, 1.03], [1, 1],
  ]);
  const arms = keyed(p, [[0, 0], [0.12, -20], [0.3, -132], [0.7, -132], [0.92, 0], [1, 0]]);
  return {
    hoverY: lift,
    scale: squash - 1,
    armLPitch: arms * D,
    armRPitch: -arms * D,
    elbowL: keyed(p, [[0, 0], [0.3, -16], [0.7, -16], [1, 0]]) * D,
    elbowR: keyed(p, [[0, 0], [0.3, -16], [0.7, -16], [1, 0]]) * D,
    legLPitch: keyed(p, [[0, 0], [0.3, -26], [0.6, 10], [1, 0]]) * D,
    legRPitch: keyed(p, [[0, 0], [0.3, 26], [0.6, -10], [1, 0]]) * D,
    kneeL: keyed(p, [[0, 0], [0.3, 40], [0.7, 0], [1, 0]]) * D,
    kneeR: keyed(p, [[0, 0], [0.3, 40], [0.7, 0], [1, 0]]) * D,
    /* A genuine turn about Y. The flat renderer applied rotateY to 2D groups
       with no perspective, which collapsed to a squash; here it actually
       shows the character's back. */
    rootSpin: keyed(p, [[0, 0], [0.22, 0], [0.58, 360], [1, 360]]) * D,
    headPitch: keyed(p, [[0, 0], [0.3, -14], [0.7, -14], [1, 0]]) * D,
    coreIntensity: keyed(p, [[0, 0], [0.3, 1.8], [0.6, 0.4], [1, 0]]),
  };
}

/* ----------------------------------------------------------------- alarm */
const alarm: Performance = {
  pose(c) {
    /* After the startle the guard is held, with a tense tremor, for as long as
       the state lasts. */
    c.torsoLean.target = -10 * D;
    c.headPitch.target = -12 * D;
    c.armLPitch.target = -62 * D;
    c.armRPitch.target = -62 * D;
    c.armLRoll.target = 34 * D;
    c.armRRoll.target = -34 * D;
    c.elbowL.target = -96 * D;
    c.elbowR.target = -96 * D;
    c.eyeIntensity.target = 1.6;
    c.coreIntensity.target = 1.5;
    c.mouthOpen.target = 0.7;
  },
  motion(t) {
    return {
      /* Everything emissive square-waves together at 2.4 Hz, so the whole
         torso strobes from the inside rather than a lamp changing colour. */
      coreIntensity: Math.sin(t * 15) > 0 ? 0.9 : -0.5,
      eyeIntensity: Math.sin(t * 15) > 0 ? 0.5 : -0.3,
      tipIntensity: Math.sin(t * 15) > 0 ? 0.8 : -0.6,
      headYaw: Math.sin(t * 38) * 0.7 * D,
      torsoTwist: Math.sin(t * 34) * 0.6 * D,
    };
  },
  fixtures: { ...NO_FIXTURES, shield: true },
  duration: 1.6,
};

/** The startle. A spring cannot produce a hit this sharp. */
export function alarmTimeline(p: number): Additive {
  const recoil = keyed(p, [[0, 0], [0.06, -0.24], [0.22, 0.06], [0.4, -0.03], [1, 0]]);
  return {
    hoverY: ease.damped(p, 2.5, 9) * 0.05,
    torsoLean: recoil * 60 * D,
    headPitch: recoil * 70 * D,
    scale: keyed(p, [[0, 0], [0.06, 0.06], [0.3, -0.02], [1, 0]]),
    armLPitch: keyed(p, [[0, 0], [0.1, -70], [0.35, -50], [1, 0]]) * D,
    armRPitch: keyed(p, [[0, 0], [0.1, -70], [0.35, -50], [1, 0]]) * D,
    eyeIntensity: keyed(p, [[0, 0], [0.08, 1.4], [0.5, 0.4], [1, 0]]),
  };
}

/* --------------------------------------------------------------- dancing */
/* The success choreography made continuous, with a half-turn per hop so the
   viewer genuinely sees the character from behind. That is the strongest
   possible "this is 3D, not a sprite" tell, and it is the one thing the flat
   renderer could never do. */
const dancing: Performance = {
  pose(c) {
    c.eyeIntensity.target = 1.35;
    c.coreIntensity.target = 1.25;
    c.mouthOpen.target = 0.75;
    c.elbowL.target = -70 * D;
    c.elbowR.target = -70 * D;
  },
  motion(t) {
    const beat = (t / 1.4) * Math.PI * 2;
    return {
      hoverY: Math.abs(Math.sin(beat)) * 0.3,
      scale: -Math.abs(Math.cos(beat)) * 0.06,
      hipSway: Math.sin(beat / 2) * 0.12,
      torsoTwist: Math.sin(beat / 2) * 16 * D,
      headRoll: Math.sin(beat / 2 + 0.6) * 12 * D,
      headPitch: Math.sin(beat) * 6 * D,
      armLPitch: -88 * D + Math.sin(beat) * 34 * D,
      armRPitch: -88 * D - Math.sin(beat) * 34 * D,
      legLPitch: Math.sin(beat + Math.PI) * 22 * D,
      legRPitch: -Math.sin(beat + Math.PI) * 22 * D,
      kneeL: Math.max(0, Math.sin(beat)) * 30 * D,
      kneeR: Math.max(0, -Math.sin(beat)) * 30 * D,
      rootSpin: t * 128 * D,
      coreIntensity: 0.35 * Math.abs(Math.sin(beat)),
    };
  },
  fixtures: { ...NO_FIXTURES, confetti: true },
  duration: null,
};

export const PERFORMANCES: Record<SentryState, Performance> = {
  idle, listening, thinking, working, speaking, waiting, success, alarm, dancing,
};
