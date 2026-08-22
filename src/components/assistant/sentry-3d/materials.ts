import {
  CanvasTexture,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SpriteMaterial,
  AdditiveBlending,
  type Material,
  type Texture,
} from "three";

/**
 * Sentry's material set.
 *
 * Five shared instances rather than one per mesh — both arms are the same
 * machined plate, and uploading that twice buys nothing but a longer dispose
 * list.
 *
 * The single biggest reason the flat character read as "pale" was that nothing
 * on it reflected anything. A physical material with no environment to sample
 * renders as a flat lambert blob no matter how the lights are placed, so the
 * shell here is built to be seen *through* its clearcoat: a dark base that
 * contributes almost no diffuse, and a lacquer layer that does the work.
 *
 * Colours come from the stylesheet rather than literals. globals.css states the
 * rule that nothing hardcodes a hex, and a robot that ignores a theme change is
 * exactly the sort of thing that quietly rots.
 */

export interface Palette {
  /** The current state's tone. */
  tone: Color;
  brand: Color;
  accent: Color;
}

/** Reads a design token, falling back only when the property resolves empty. */
export function tokenColor(name: string, fallback: string): Color {
  if (typeof window === "undefined") return new Color(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return raw ? new Color().setStyle(raw) : new Color(fallback);
  } catch {
    return new Color(fallback);
  }
}

/**
 * A radial gradient on a canvas, used for every additive glow and the contact
 * shadow. Cheaper than a texture file, and it cannot 404.
 */
function radialTexture(inner: string, outer: string, stops?: [number, string][]): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  for (const [at, colour] of stops ?? []) g.addColorStop(at, colour);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export interface MaterialSet {
  /** Torso and skull — coated composite. */
  shell: MeshPhysicalMaterial;
  /** Limbs and caps — machined metal, brighter and tighter than the shell. */
  plate: MeshStandardMaterial;
  /** Cavities, seams, the visor well. Light goes in and does not come out. */
  dark: MeshStandardMaterial;
  /** The visor. Deliberately not `transmission`: see the note below. */
  glass: MeshPhysicalMaterial;
  /** Separate instances — their intensities diverge per state. */
  eyeGlow: MeshStandardMaterial;
  coreGlow: MeshStandardMaterial;
  tipGlow: MeshStandardMaterial;
  mouthGlow: MeshStandardMaterial;
  /** Additive sprites for bloom-without-a-composer. */
  glowSprite: SpriteMaterial;
  shadowTexture: Texture;
  dispose(): void;
}

export function createMaterials(palette: Palette): MaterialSet {
  const tone = palette.tone;

  const shell = new MeshPhysicalMaterial({
    color: 0x1b1b26,
    metalness: 0.55,
    roughness: 0.38,
    /* The lacquer is what makes it read as a manufactured object rather than
       grey plastic. Without an environment map to sample it does nothing, so
       stage.ts builds one. */
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.15,
  });

  const plate = new MeshStandardMaterial({
    color: 0x23232f,
    metalness: 0.78,
    roughness: 0.26,
    envMapIntensity: 1.25,
  });

  const dark = new MeshStandardMaterial({
    color: 0x08080c,
    metalness: 0.2,
    roughness: 0.65,
  });

  /* `transmission` would force an extra full-scene render target every frame.
     Against a near-black interior the result is indistinguishable from a low
     opacity plus a hard clearcoat, so this buys the same look for none of the
     cost. */
  const glass = new MeshPhysicalMaterial({
    color: 0x06060b,
    metalness: 0.1,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    envMapIntensity: 1.6,
  });

  const emissive = (intensity: number) =>
    new MeshStandardMaterial({
      color: 0x0a0a12,
      emissive: tone.clone(),
      emissiveIntensity: intensity,
      metalness: 0,
      roughness: 1,
      toneMapped: false,
    });

  const eyeGlow = emissive(2.6);
  const coreGlow = emissive(2.2);
  const tipGlow = emissive(2.4);
  const mouthGlow = emissive(2.0);

  const glowTexture = radialTexture("rgba(255,255,255,0.95)", "rgba(255,255,255,0)", [
    [0.35, "rgba(255,255,255,0.35)"],
  ]);
  const glowSprite = new SpriteMaterial({
    map: glowTexture,
    color: tone.clone(),
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const shadowTexture = radialTexture("rgba(0,0,0,0.85)", "rgba(0,0,0,0)", [
    [0.55, "rgba(0,0,0,0.32)"],
  ]);

  const all: Material[] = [
    shell, plate, dark, glass, eyeGlow, coreGlow, tipGlow, mouthGlow, glowSprite,
  ];

  return {
    shell, plate, dark, glass,
    eyeGlow, coreGlow, tipGlow, mouthGlow,
    glowSprite, shadowTexture,
    dispose() {
      for (const m of all) m.dispose();
      glowTexture.dispose();
      shadowTexture.dispose();
    },
  };
}

/**
 * Cross-fades every tone-carrying material toward a new colour.
 *
 * Called every frame with the frame delta rather than on state change, so a
 * state that changes twice in quick succession blends through rather than
 * snapping twice.
 */
export function blendTone(m: MaterialSet, target: Color, dt: number): void {
  const k = 1 - Math.exp(-8 * dt);
  m.eyeGlow.emissive.lerp(target, k);
  m.coreGlow.emissive.lerp(target, k);
  m.tipGlow.emissive.lerp(target, k);
  m.mouthGlow.emissive.lerp(target, k);
  m.glowSprite.color.lerp(target, k);
}
