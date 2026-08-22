import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Sprite,
  TorusGeometry,
  AdditiveBlending,
  DoubleSide,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { MaterialSet } from "./materials";

/**
 * Sentry, assembled from primitives.
 *
 * No model file: Blender is not available here, and a character built in code
 * has the advantage that every joint is a named group the animation layer can
 * address by hand.
 *
 * The hierarchy deliberately mirrors the pivots the flat renderer already uses
 * (globals.css:743-754) — shoulder, elbow, hip, neck, antenna base — so the
 * existing choreography maps across rather than being reinvented. The one
 * addition is a real elbow and knee: a single-segment limb cannot show effort,
 * and the lag between upper arm and forearm is what reads as a joint.
 *
 * Mirrored parts share geometry instances. Both upper arms are the same capsule
 * and uploading it twice buys nothing but a longer dispose list.
 */

export interface Rig {
  root: Group;
  /** Sits outside `body` so props do not inherit the hop. */
  props: Group;
  parts: {
    body: Group;
    torso: Mesh;
    core: Mesh;
    coreGlow: Sprite;
    coreLight: PointLight;
    head: Group;
    visor: Mesh;
    eyes: Group;
    eyeL: Mesh;
    eyeR: Mesh;
    eyeGlowL: Sprite;
    eyeGlowR: Sprite;
    mouth: Group;
    mouthSegs: Mesh[];
    antenna: Group;
    tip: Mesh;
    tipGlow: Sprite;
    armL: Group;
    armR: Group;
    elbowL: Group;
    elbowR: Group;
    palmL: Mesh;
    palmR: Mesh;
    legL: Group;
    legR: Group;
    kneeL: Group;
    kneeR: Group;
    shadow: Mesh;
    scanRing: Mesh;
    scanBeam: Mesh;
    shield: Group;
    confetti: Sprite[];
  };
  dispose(): void;
}

export function buildRig(m: MaterialSet): Rig {
  const geos: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };

  const root = new Group();
  const body = new Group();
  body.position.set(0, 0.95, 0); // hips
  root.add(body);

  /* ------------------------------------------------------------- shadow */
  const shadow = new Mesh(
    keep(new PlaneGeometry(2.3, 2.3)),
    new MeshBasicMaterial({
      map: m.shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  root.add(shadow);

  /* -------------------------------------------------------------- torso */
  const torso = new Mesh(keep(new RoundedBoxGeometry(0.92, 1.05, 0.62, 4, 0.14)), m.shell);
  torso.position.y = 0.52;
  body.add(torso);

  const chestPlate = new Mesh(keep(new RoundedBoxGeometry(0.66, 0.6, 0.06, 3, 0.05)), m.shell);
  chestPlate.position.set(0, 0.56, 0.3);
  body.add(chestPlate);

  const coreRing = new Mesh(keep(new TorusGeometry(0.17, 0.032, 12, 32)), m.plate);
  coreRing.position.set(0, 0.6, 0.33);
  body.add(coreRing);

  const core = new Mesh(keep(new SphereGeometry(0.115, 24, 16)), m.coreGlow);
  core.position.set(0, 0.6, 0.33);
  body.add(core);

  const coreGlow = new Sprite(m.glowSprite);
  coreGlow.scale.setScalar(0.9);
  coreGlow.position.set(0, 0.6, 0.4);
  body.add(coreGlow);

  /* Lighting the chest from inside is what sells the core as a source rather
     than a sticker. */
  const coreLight = new PointLight(0xffffff, 1.6, 3.2);
  coreLight.position.set(0, 0.6, 0.42);
  body.add(coreLight);

  const ventGeo = keep(new BoxGeometry(0.3, 0.022, 0.02));
  for (const y of [0.2, 0.14]) {
    const v = new Mesh(ventGeo, m.dark);
    v.position.set(0, y, 0.32);
    body.add(v);
  }

  const hipBand = new Mesh(keep(new CylinderGeometry(0.34, 0.34, 0.1, 20)), m.plate);
  hipBand.position.y = 0.02;
  body.add(hipBand);

  const shoulderGeo = keep(new SphereGeometry(0.185, 20, 14));
  for (const x of [-0.5, 0.5]) {
    const s = new Mesh(shoulderGeo, m.plate);
    s.position.set(x, 0.9, 0);
    body.add(s);
  }

  /* --------------------------------------------------------------- arms */
  const upperGeo = keep(new CapsuleGeometry(0.105, 0.24, 6, 14));
  const foreGeo = keep(new CapsuleGeometry(0.095, 0.22, 6, 14));
  const handGeo = keep(new IcosahedronGeometry(0.125, 1));
  const palmGeo = keep(new CircleGeometry(0.048, 16));

  function makeArm(side: -1 | 1) {
    const arm = new Group();
    arm.position.set(0.52 * side, 0.9, 0);
    body.add(arm);

    const upper = new Mesh(upperGeo, m.plate);
    upper.position.y = -0.17;
    arm.add(upper);

    const elbow = new Group();
    elbow.position.y = -0.32;
    arm.add(elbow);

    const fore = new Mesh(foreGeo, m.plate);
    fore.position.y = -0.15;
    elbow.add(fore);

    const hand = new Mesh(handGeo, m.shell);
    hand.position.y = -0.32;
    elbow.add(hand);

    const palm = new Mesh(palmGeo, m.eyeGlow);
    palm.position.set(0, -0.32, 0.11);
    elbow.add(palm);

    return { arm, elbow, palm };
  }

  const L = makeArm(-1);
  const R = makeArm(1);

  /* --------------------------------------------------------------- legs */
  const thighGeo = keep(new CapsuleGeometry(0.125, 0.18, 6, 14));
  const shinGeo = keep(new CapsuleGeometry(0.108, 0.16, 6, 14));
  const footGeo = keep(new RoundedBoxGeometry(0.3, 0.12, 0.38, 3, 0.05));

  function makeLeg(side: -1 | 1) {
    const leg = new Group();
    leg.position.set(0.2 * side, 0, 0);
    body.add(leg);

    const thigh = new Mesh(thighGeo, m.plate);
    thigh.position.y = -0.14;
    leg.add(thigh);

    const knee = new Group();
    knee.position.y = -0.27;
    leg.add(knee);

    const shin = new Mesh(shinGeo, m.plate);
    shin.position.y = -0.13;
    knee.add(shin);

    const foot = new Mesh(footGeo, m.shell);
    foot.position.set(0, -0.26, 0.06);
    knee.add(foot);

    return { leg, knee };
  }

  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  /* --------------------------------------------------------------- head */
  const neck = new Mesh(keep(new CylinderGeometry(0.15, 0.18, 0.16, 16)), m.dark);
  neck.position.y = 1.06;
  body.add(neck);

  const head = new Group();
  head.position.y = 1.12;
  body.add(head);

  const skull = new Mesh(keep(new RoundedBoxGeometry(0.86, 0.68, 0.7, 5, 0.16)), m.shell);
  skull.position.y = 0.3;
  head.add(skull);

  const visorFrame = new Mesh(keep(new RoundedBoxGeometry(0.68, 0.3, 0.1, 3, 0.1)), m.dark);
  visorFrame.position.set(0, 0.32, 0.3);
  head.add(visorFrame);

  /* A curved wrap rather than a flat pane — the sweep of highlight across it as
     the head turns is most of what makes the character look moulded. */
  const visor = new Mesh(
    keep(new SphereGeometry(0.46, 32, 16, -0.62, 1.24, 1.16, 0.46)),
    m.glass,
  );
  visor.position.set(0, 0.32, 0.02);
  visor.scale.set(1, 0.62, 0.78);
  head.add(visor);

  const eyes = new Group();
  eyes.position.set(0, 0.32, 0.33);
  head.add(eyes);

  const eyeGeo = keep(new CapsuleGeometry(0.052, 0.045, 4, 10));
  const mkEye = (x: number) => {
    const e = new Mesh(eyeGeo, m.eyeGlow);
    e.position.x = x;
    e.rotation.z = Math.PI / 2;
    eyes.add(e);
    const g = new Sprite(m.glowSprite);
    g.scale.setScalar(0.42);
    g.position.set(x, 0, 0.05);
    eyes.add(g);
    return { e, g };
  };
  const eL = mkEye(-0.15);
  const eR = mkEye(0.15);

  /* The mouth is five independent segments, so speech can be an equaliser
     rather than a single bar scaling up and down like a metronome. */
  const mouth = new Group();
  mouth.position.set(0, 0.06, 0.33);
  head.add(mouth);

  const cavity = new Mesh(keep(new RoundedBoxGeometry(0.32, 0.12, 0.04, 2, 0.03)), m.dark);
  mouth.add(cavity);

  const segGeo = keep(new BoxGeometry(0.032, 0.09, 0.02));
  const mouthSegs: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new Mesh(segGeo, m.mouthGlow);
    s.position.set((i - 2) * 0.055, 0, 0.02);
    mouth.add(s);
    mouthSegs.push(s);
  }

  const earGeo = keep(new CylinderGeometry(0.075, 0.075, 0.09, 14));
  for (const x of [-0.44, 0.44]) {
    const ear = new Mesh(earGeo, m.plate);
    ear.position.set(x, 0.32, 0);
    ear.rotation.z = Math.PI / 2;
    head.add(ear);
  }

  const antenna = new Group();
  antenna.position.set(0, 0.62, 0);
  head.add(antenna);

  const rod = new Mesh(keep(new CylinderGeometry(0.02, 0.028, 0.24, 10)), m.plate);
  rod.position.y = 0.12;
  antenna.add(rod);

  const tip = new Mesh(keep(new SphereGeometry(0.055, 16, 12)), m.tipGlow);
  tip.position.y = 0.26;
  antenna.add(tip);

  const tipGlow = new Sprite(m.glowSprite);
  tipGlow.scale.setScalar(0.4);
  tipGlow.position.y = 0.26;
  antenna.add(tipGlow);

  /* ------------------------------------------------- state-only fixtures */
  /* Built once and toggled with `.visible`. Creating these per state would
     allocate inside the frame loop, which is the one place it must not. */
  const scanRing = new Mesh(keep(new TorusGeometry(0.72, 0.008, 8, 64)), m.tipGlow);
  scanRing.rotation.x = 1.15;
  scanRing.position.y = 0.34;
  scanRing.visible = false;
  head.add(scanRing);

  const scanBeam = new Mesh(
    keep(new ConeGeometry(0.42, 1.9, 24, 1, true)),
    new MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.09,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  /* ConeGeometry already has its apex at +Y, so no flip is needed: left alone
     it is a searchlight narrowing at the top and opening downward. Rotating it
     by PI inverted the cone and drew the wide end over the chest, which read as
     a rendering fault rather than a beam. Tilted forward so it lands on the
     floor ahead of the character instead of through its own legs. */
  scanBeam.rotation.x = 0.34;
  scanBeam.position.set(0, -0.63, 0.62);
  scanBeam.visible = false;
  head.add(scanBeam);

  const props = new Group();
  root.add(props);

  const shield = new Group();
  shield.position.set(0, 1.45, 0.55);
  shield.visible = false;
  props.add(shield);

  const shieldFace = new Mesh(
    keep(new CircleGeometry(0.85, 6)),
    new MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shield.add(shieldFace);

  const shieldRim = new Mesh(
    keep(new RingGeometry(0.82, 0.86, 6)),
    new MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shield.add(shieldRim);

  const confetti: Sprite[] = [];
  for (let i = 0; i < 24; i++) {
    const c = new Sprite(m.glowSprite);
    c.scale.setScalar(0.09);
    c.visible = false;
    props.add(c);
    confetti.push(c);
  }

  return {
    root,
    props,
    parts: {
      body, torso, core, coreGlow, coreLight,
      head, visor, eyes,
      eyeL: eL.e, eyeR: eR.e, eyeGlowL: eL.g, eyeGlowR: eR.g,
      mouth, mouthSegs,
      antenna, tip, tipGlow,
      armL: L.arm, armR: R.arm, elbowL: L.elbow, elbowR: R.elbow,
      palmL: L.palm, palmR: R.palm,
      legL: legL.leg, legR: legR.leg, kneeL: legL.knee, kneeR: legR.knee,
      shadow, scanRing, scanBeam, shield, confetti,
    },
    dispose() {
      for (const g of geos) g.dispose();
      (shadow.material as MeshBasicMaterial).dispose();
      (scanBeam.material as MeshBasicMaterial).dispose();
      (shieldFace.material as MeshBasicMaterial).dispose();
      (shieldRim.material as MeshBasicMaterial).dispose();
    },
  };
}
