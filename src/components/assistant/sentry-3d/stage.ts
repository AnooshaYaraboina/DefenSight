import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  BackSide,
  type WebGLRenderTarget,
} from "three";

/**
 * The room Sentry stands in.
 *
 * The environment map is the single thing that fixes "looks pale". A physical
 * material with nothing to reflect renders as a flat lambert blob however the
 * lights are arranged — the clearcoat on the shell has no meaning until there
 * is a room for it to mirror. Rather than ship an HDR file, three emissive
 * planes inside a black box are pre-filtered at runtime: about thirty lines,
 * no asset to 404, and it encodes this console's exact light language into
 * every specular highlight.
 *
 * three's own RoomEnvironment was the obvious alternative and is the wrong one
 * here — it is a bright white studio and washes an obsidian palette to grey.
 */

export interface Stage {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  coreLightTarget: { intensity: number };
  resize(w: number, h: number): void;
  dispose(): void;
}

export function createStage(
  container: HTMLElement,
  brand: Color,
  accent: Color,
): Stage {
  /* The canvas is created here rather than passed in from JSX. React's
     StrictMode mounts effects twice in development, and a second getContext()
     on the same element hands back the *first* context — which the new renderer
     then tramples. Owning the element makes setup idempotent. */
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    /* Transparent, so the console's grid and radial brand wash stay visible
       through and around the character. An opaque canvas would cut a rectangle
       out of the page's ambience. */
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();

  /* ------------------------------------------------------- environment */
  const envScene = new Scene();
  const box = new Mesh(
    new BoxGeometry(12, 12, 12),
    new MeshBasicMaterial({ color: 0x05050a, side: BackSide }),
  );
  envScene.add(box);

  const panelGeo = new PlaneGeometry(1, 1);
  const panels: Mesh[] = [];
  const addPanel = (
    colour: Color | number,
    intensity: number,
    scale: [number, number],
    pos: [number, number, number],
    look: [number, number, number],
  ) => {
    const mat = new MeshBasicMaterial({ color: colour });
    mat.color.multiplyScalar(intensity);
    const p = new Mesh(panelGeo, mat);
    p.scale.set(scale[0], scale[1], 1);
    p.position.set(...pos);
    p.lookAt(...look);
    envScene.add(p);
    panels.push(p);
  };

  // Overhead white — the console's "surfaces catch light from above" language.
  addPanel(0xffffff, 2.4, [8, 8], [0, 5.5, 0], [0, 0, 0]);
  // Bluebird from behind-left, so the rim appears in every reflection.
  addPanel(brand, 3.0, [7, 7], [-5, 1.6, -4], [0, 0, 0]);
  // Low cyan bounce on the right.
  addPanel(accent, 1.2, [6, 4], [4.5, -1.5, 3], [0, 0, 0]);

  const pmrem = new PMREMGenerator(renderer);
  const envRT: WebGLRenderTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;

  /* ------------------------------------------------------------ lights */
  const ambient = new AmbientLight(0x14141f, 0.7);
  scene.add(ambient);

  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 5, 3);
  scene.add(key);

  const rim = new DirectionalLight(brand.getHex(), 2.8);
  rim.position.set(-4, 2.2, -3);
  scene.add(rim);

  const fill = new DirectionalLight(accent.getHex(), 0.85);
  fill.position.set(3, -1.5, 2);
  scene.add(fill);

  /* ------------------------------------------------------------ camera */
  /* 30 degrees is deliberately long. Wide-angle distortion is most of what
     makes a primitive-built character read as programmer art — the head
     balloons and the feet vanish. */
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.5, 7.1);
  camera.lookAt(0, 1.26, 0);

  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    renderer,
    coreLightTarget: { intensity: 1.6 },
    resize,
    dispose() {
      box.geometry.dispose();
      (box.material as MeshBasicMaterial).dispose();
      panelGeo.dispose();
      for (const p of panels) (p.material as MeshBasicMaterial).dispose();
      envRT.dispose();
      pmrem.dispose();
      scene.environment = null;
      renderer.dispose();
      /* Without this the GPU context lingers until collection, and a dozen hot
         reloads hit the browser's context ceiling. */
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
