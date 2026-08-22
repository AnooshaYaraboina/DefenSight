import { Color } from "three";
import { ONE_SHOT, TONE, TONE_FALLBACK, type SentryState } from "../sentry-state";
import { blendTone, createMaterials, tokenColor, type MaterialSet } from "./materials";
import { buildRig, type Rig } from "./rig";
import { createStage, type Stage } from "./stage";
import {
  createChannels, stepChannels, Intermittent, Timeline,
  type Channels,
} from "./anim";
import {
  PERFORMANCES, alarmTimeline, successTimeline,
  type Additive,
} from "./performances";

/**
 * Owns the frame loop.
 *
 * React holds no state for the 3D path and never renders a frame — the state
 * prop arrives here as a method call on a ref. That is not a style preference:
 * the repo lints against setState inside an effect body, and a character
 * updating twenty channels at 60fps through React would be both illegal and
 * absurd.
 */

const REDUCED_AMPLITUDE = 0.3;

export class Director {
  private stage: Stage;
  private rig: Rig;
  private materials: MaterialSet;
  private channels: Channels;

  private state: SentryState = "idle";
  private tone: Color;
  private blend = 0;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private running = false;
  private disposed = false;

  private blink = new Intermittent(2.4, 6.9);
  private saccade = new Intermittent(1.8, 5.2);
  private blinkAt = -Infinity;
  private saccadeX = 0;
  private saccadeTarget = 0;

  private oneShot = new Map<SentryState, Timeline>();
  private reduced: boolean;

  constructor(container: HTMLElement) {
    const brand = tokenColor("--color-brand", "#1c7ff0");
    const accent = tokenColor("--color-accent", "#22d3ee");
    this.tone = brand.clone();

    this.reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.stage = createStage(container, brand, accent);
    this.materials = createMaterials({ tone: this.tone, brand, accent });
    this.rig = buildRig(this.materials);
    this.stage.scene.add(this.rig.root);
    this.channels = createChannels();

    for (const s of ONE_SHOT) {
      this.oneShot.set(s, new Timeline(PERFORMANCES[s].duration ?? 1));
    }

    PERFORMANCES.idle.pose(this.channels);
  }

  /**
   * A one-shot restarts even when the state has not changed.
   *
   * The flat renderer could not do this — a CSS animation with an iteration
   * count of one will not replay without a DOM remount, so a second alarm in a
   * row played nothing at all. Two alarms should look like two alarms.
   */
  setState(next: SentryState): void {
    const shot = this.oneShot.get(next);
    if (shot) shot.restart(this.clock);
    if (next === this.state) return;

    this.state = next;
    this.blend = 0;
    PERFORMANCES[next].pose(this.channels);

    const token = TONE[next];
    this.tone = tokenColor(token, TONE_FALLBACK[next]);

    const f = PERFORMANCES[next].fixtures;
    this.rig.parts.scanRing.visible = f.scanRing;
    this.rig.parts.scanBeam.visible = f.scanBeam;
    this.rig.parts.shield.visible = f.shield;
    for (const c of this.rig.parts.confetti) c.visible = f.confetti;
  }

  resize(w: number, h: number): void {
    this.stage.resize(w, h);
  }

  /**
   * Draw immediately into the current task.
   *
   * The renderer runs without `preserveDrawingBuffer`, which is the right
   * default — keeping the buffer around costs real performance on every frame.
   * The consequence is that reading the canvas at an arbitrary moment returns a
   * cleared one, so anything sampling pixels has to force a draw first.
   */
  renderNow(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(now: number): void {
    /* Clamped so a restored background tab does not teleport every limb. */
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    this.clock += dt;
    const t = this.clock;

    const perf = PERFORMANCES[this.state];
    const c = this.channels;

    /* Loops fade their additive layer in; one-shots own the frame outright. */
    this.blend = Math.min(1, this.blend + dt * 4);

    let add: Additive = perf.motion(t);
    const shot = this.oneShot.get(this.state);
    if (shot) {
      const p = shot.progress(now / 1000);
      if (p !== null) {
        add = this.state === "alarm" ? alarmTimeline(p) : successTimeline(p);
      }
    }

    const k = this.reduced ? REDUCED_AMPLITUDE : 1;
    const A = (v: number | undefined) => (v ?? 0) * k * this.blend;

    stepChannels(c, dt);

    /* -------------------------------------------------------- base layer */
    /* Blink and saccade run in every state, including the one defined by
       stillness — a character that never blinks is a mannequin. */
    if (this.blink.due(t)) this.blinkAt = t;
    const sinceBlink = t - this.blinkAt;
    const lid =
      sinceBlink >= 0 && sinceBlink < 0.13
        ? 1 - Math.sin((sinceBlink / 0.13) * Math.PI) * 0.94
        : 1;

    if (this.saccade.due(t)) this.saccadeTarget = (Math.random() - 0.5) * 0.04;
    this.saccadeX += (this.saccadeTarget - this.saccadeX) * Math.min(1, dt * 9);

    /* -------------------------------------------------------- apply pose */
    const p = this.rig.parts;

    this.rig.root.position.y = c.hoverY.value + A(add.hoverY);
    this.rig.root.rotation.y = c.rootSpin.value + A(add.rootSpin);

    const s = 1 + c.scale.value - 1 + A(add.scale);
    p.body.scale.set(1 / Math.max(0.6, s) * 1, Math.max(0.6, s), 1);
    p.body.position.x = A(add.hipSway);
    p.body.rotation.x = c.torsoLean.value + A(add.torsoLean);
    p.body.rotation.y = c.torsoTwist.value + A(add.torsoTwist);

    p.head.rotation.x = c.headPitch.value + A(add.headPitch);
    p.head.rotation.y = c.headYaw.value + A(add.headYaw);
    p.head.rotation.z = c.headRoll.value + A(add.headRoll);

    p.armL.rotation.x = c.armLPitch.value + A(add.armLPitch);
    p.armR.rotation.x = c.armRPitch.value + A(add.armRPitch);
    p.armL.rotation.z = c.armLRoll.value;
    p.armR.rotation.z = c.armRRoll.value;
    p.elbowL.rotation.x = c.elbowL.value + A(add.elbowL);
    p.elbowR.rotation.x = c.elbowR.value + A(add.elbowR);

    p.legL.rotation.x = c.legLPitch.value + A(add.legLPitch);
    p.legR.rotation.x = c.legRPitch.value + A(add.legRPitch);
    p.kneeL.rotation.x = c.kneeL.value + A(add.kneeL);
    p.kneeR.rotation.x = c.kneeR.value + A(add.kneeR);

    p.eyes.position.x = this.saccadeX;
    p.eyeL.scale.y = lid;
    p.eyeR.scale.y = lid;

    const mouth = Math.max(0.05, c.mouthOpen.value + A(add.mouthOpen));
    for (let i = 0; i < p.mouthSegs.length; i++) {
      /* Five segments on incommensurate phases — an equaliser, not a bar. */
      const seg = 0.35 + 0.65 * Math.abs(Math.sin(t * (7 + i * 1.6) + i));
      p.mouthSegs[i].scale.y = Math.max(0.12, mouth * seg);
    }

    /* ----------------------------------------------------------- emissive */
    const eye = Math.max(0.1, c.eyeIntensity.value + A(add.eyeIntensity));
    const core = Math.max(0.1, c.coreIntensity.value + A(add.coreIntensity));
    const tip = Math.max(0.1, c.tipIntensity.value + A(add.tipIntensity));

    this.materials.eyeGlow.emissiveIntensity = 2.6 * eye;
    this.materials.coreGlow.emissiveIntensity = 2.2 * core;
    this.materials.tipGlow.emissiveIntensity = 2.4 * tip;
    this.materials.mouthGlow.emissiveIntensity = 2.0 * (0.4 + mouth);
    p.coreLight.intensity = 1.6 * core;
    p.coreLight.color.copy(this.tone);
    p.coreGlow.scale.setScalar(0.75 + core * 0.28);
    p.tipGlow.scale.setScalar(0.32 + tip * 0.14);

    blendTone(this.materials, this.tone, dt);

    /* ---------------------------------------------------------- fixtures */
    if (p.scanRing.visible) {
      p.scanRing.rotation.z = t * 0.9;
      p.scanRing.rotation.x = 1.15 + Math.sin(t * 0.6) * 0.18;
    }
    if (p.scanBeam.visible) {
      p.scanBeam.rotation.z = Math.sin(t / 3.2 * Math.PI * 2) * 0.28;
    }
    if (p.shield.visible) {
      const sp = shot?.progress(now / 1000) ?? 1;
      const grow = sp < 0.3 ? sp / 0.3 : 1;
      p.shield.scale.setScalar(0.7 + grow * 0.34);
      p.shield.rotation.z = t * 0.4;
    }
    if (p.confetti[0]?.visible) this.confetti(t);

    /* ------------------------------------------------------------ shadow */
    /* Scales and fades with height. Without this the character slides
       upward rather than leaving the floor. */
    const lift = Math.max(0, this.rig.root.position.y);
    const shrink = 1 / (1 + lift * 1.6);
    p.shadow.scale.setScalar(Math.max(0.4, shrink));
    (p.shadow.material as { opacity: number }).opacity = 0.9 * shrink;
    p.shadow.position.y = -this.rig.root.position.y + 0.002;

    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  /** Ballistic arcs, computed from the index so nothing allocates per frame. */
  private confetti(t: number): void {
    const pieces = this.rig.parts.confetti;
    for (let i = 0; i < pieces.length; i++) {
      const phase = (t * 0.65 + i / pieces.length) % 1;
      const angle = (i / pieces.length) * Math.PI * 2;
      const reach = 1.1 + (i % 4) * 0.35;
      const c = pieces[i];
      c.position.set(
        Math.cos(angle) * reach * phase,
        1.5 + Math.sin(angle * 1.7) * 0.6 + phase * 1.6 - phase * phase * 3.4,
        Math.sin(angle) * reach * phase * 0.5,
      );
      c.scale.setScalar(0.09 * (1 - phase));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.stage.scene.remove(this.rig.root);
    this.rig.dispose();
    this.materials.dispose();
    this.stage.dispose();
  }
}
