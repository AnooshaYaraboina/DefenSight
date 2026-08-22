"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Point-cloud globe.
 *
 * Motion notes, which matter more than the geometry here:
 *
 *   · Rotation is ~18s per turn and NEVER stops. Under prefers-reduced-motion it
 *     slows to ~44s rather than freezing — an earlier pass halted the render
 *     loop entirely there, which is indistinguishable from a broken canvas.
 *   · Streams of dots run the arcs continuously. Segments behind the sphere are
 *     dimmed rather than clipped, and six arcs run at staggered phases, so
 *     traffic stays visible through the whole rotation instead of blinking out
 *     for seconds at a time.
 *   · Links bow outward from the surface rather than cutting through the
 *     sphere as straight chords — a chord reads as a line drawn over the globe,
 *     an arc reads as a path across it.
 *
 * Points use the Fibonacci lattice with added clustering: naive lat/long
 * sampling bunches at the poles, and perfectly even coverage reads as a
 * wireframe rather than as terrain.
 *
 * Lit nodes are always visible and always hoverable, on the near face and the
 * far one alike — they are the interactive layer, so occluding them behind the
 * sphere would make them blink in and out of reach mid-rotation. Hit-testing
 * runs against the positions the last frame actually projected, held in a ref,
 * so the target is exactly what is on screen rather than a recomputed guess.
 */

export interface GlobeNode {
  lat: number;
  lon: number;
  color: string;
  label: string;
  detail: string;
}

const DEFAULT_NODES: GlobeNode[] = [
  { lat: 38, lon: -128, color: "#22d3ee", label: "Ingest", detail: "Normalised and decoded" },
  { lat: 16, lon: -58, color: "#f59e0b", label: "Retrieval", detail: "Provenance checked" },
  { lat: -12, lon: -150, color: "#6366f1", label: "Tool gateway", detail: "Default closed" },
  { lat: -40, lon: -78, color: "#c026d3", label: "Decision", detail: "Most restrictive wins" },
];

/**
 * Arcs are derived from the node list rather than hard-coded, so changing how
 * many nodes the page supplies rewires the traffic automatically. Each node
 * links to its neighbour and to the node opposite it, which guarantees paths
 * crossing the sphere rather than a ring around one face.
 */
function buildArcs(count: number): [number, number, number][] {
  if (count < 2) return [];
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    out.push([i, (i + 1) % count, i / count]);
    if (count > 3) {
      out.push([i, (i + Math.floor(count / 2)) % count, (i + 0.5) / count]);
    }
  }
  return out;
}

type P3 = { x: number; y: number; z: number };

function fromLatLon(lat: number, lon: number): P3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

/** Spherical interpolation, lifted off the surface to bow the arc outward. */
function arcPoint(a: P3, b: P3, t: number, lift: number): P3 {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const s = Math.sin(omega) || 1e-6;
  const w1 = Math.sin((1 - t) * omega) / s;
  const w2 = Math.sin(t * omega) / s;
  const p = { x: a.x * w1 + b.x * w2, y: a.y * w1 + b.y * w2, z: a.z * w1 + b.z * w2 };
  const r = 1 + lift * Math.sin(Math.PI * t);
  return { x: p.x * r, y: p.y * r, z: p.z * r };
}

interface Hit {
  i: number;
  x: number;
  y: number;
}

export function Globe({
  className,
  points = 2800,
  nodes = DEFAULT_NODES,
}: {
  className?: string;
  points?: number;
  nodes?: GlobeNode[];
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  /** Where each node landed on screen last frame — the hover hit-test target. */
  const hits = React.useRef<Hit[]>([]);
  /* Hover carries the cursor position as well as the index. Anchoring the
     tooltip to the cursor rather than to the node avoids updating state every
     frame just to track a mark that is rotating away under it. */
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);

  /* The draw loop reads the hovered index through a ref, written in an effect
     rather than during render: putting `hover` in the effect deps would tear
     down and rebuild the entire point cloud on every pointer move. */
  const hoverRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    hoverRef.current = hover?.i ?? null;
  }, [hover]);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let w = 0;
    let h = 0;

    const clusters = [
      fromLatLon(30, -120),
      fromLatLon(-8, -60),
      fromLatLon(-35, -160),
      fromLatLon(52, -20),
    ];

    const cloud: { p: P3; weight: number }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < points; i++) {
      const y = 1 - (i / (points - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const p = { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
      let best = 0;
      for (const c of clusters) best = Math.max(best, p.x * c.x + p.y * c.y + p.z * c.z);
      cloud.push({ p, weight: Math.max(0, (best - 0.55) / 0.45) });
    }

    const nodes3 = nodes.map((n) => ({ ...n, p: fromLatLon(n.lat, n.lon) }));
    const arcs = buildArcs(nodes3.length);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rotate(p: P3, a: number): P3 {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return { x: p.x * cos - p.z * sin, y: p.y, z: p.x * sin + p.z * cos };
    }

    function draw(t: number) {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42;
      const tilt = -0.3;
      const angle = t / (reduced ? 7000 : 2900);

      ctx!.clearRect(0, 0, w, h);

      const project = (p: P3) => {
        const r = rotate(p, angle);
        const ty = r.y * Math.cos(tilt) - r.z * Math.sin(tilt);
        const tz = r.y * Math.sin(tilt) + r.z * Math.cos(tilt);
        return { x: cx + r.x * R, y: cy + ty * R, z: tz };
      };

      /* ------------------------------------------------------ centre bloom */
      const bloom = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
      bloom.addColorStop(0, "rgba(120, 220, 205, 0.10)");
      bloom.addColorStop(0.45, "rgba(90, 160, 190, 0.04)");
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = bloom;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
      ctx!.fill();

      /* ------------------------------------------------------- point cloud */
      for (const c of cloud) {
        const s = project(c.p);
        const depth = (s.z + 1) / 2;
        // Floors matter more than the range here. At the previous 0.05/0.4
        // the far hemisphere fell to ~0.03 alpha at sub-pixel size and simply
        // vanished, so the globe read as a crescent rather than a sphere.
        // Depth still cues front-from-back; it no longer erases the back.
        const alpha = (0.24 + depth * 0.38) * (0.6 + c.weight * 0.7);
        // Deliberately fine. Legibility on the far side comes from the alpha
        // floor above, not from making every dot bigger — enlarging them
        // turns the cloud into a mesh and loses the sense of a surface.
        const size = 0.5 + depth * 0.45 + c.weight * 0.25;
        ctx!.fillStyle =
          c.weight > 0.15 ? `rgba(150, 232, 216, ${alpha})` : `rgba(196, 212, 238, ${alpha})`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, size, 0, Math.PI * 2);
        ctx!.fill();
      }

      /* -------------------------------------------------- arcs + in-flight */
      const SEGS = 46;
      for (const [ai, bi, phase] of arcs) {
        const A = nodes3[ai].p;
        const B = nodes3[bi].p;

        // Drawn per-segment so depth can fade the arc rather than clip it.
        for (let i = 0; i < SEGS; i++) {
          const s1 = project(arcPoint(A, B, i / SEGS, 0.16));
          const s2 = project(arcPoint(A, B, (i + 1) / SEGS, 0.16));
          const depth = ((s1.z + s2.z) / 2 + 1) / 2;
          ctx!.strokeStyle = `rgba(150, 200, 230, ${0.035 + depth * 0.13})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(s1.x, s1.y);
          ctx!.lineTo(s2.x, s2.y);
          ctx!.stroke();
        }

        // The stream. Dots behind the sphere are dimmed, never dropped, so the
        // traffic stays continuous through the whole rotation.
        const TRAIL = 22;
        const speed = reduced ? 14000 : 6000;
        const head = (t / speed + phase) % 1;
        for (let k = 0; k < TRAIL; k++) {
          const u = head - k * 0.019;
          if (u < 0 || u > 1) continue;
          const s = project(arcPoint(A, B, u, 0.16));
          const depth = (s.z + 1) / 2;
          const behind = depth < 0.42;
          const fade = (1 - k / TRAIL) * (behind ? 0.15 : 0.4 + depth * 0.6);
          ctx!.fillStyle = `rgba(90, 240, 232, ${fade})`;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, (2.3 - (k / TRAIL) * 1.4) * (behind ? 0.6 : 1), 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      /* -------------------------------------------------------- lit nodes */
      const nextHits: Hit[] = [];
      nodes3.forEach((n, i) => {
        const s = project(n.p);
        const depth = (s.z + 1) / 2;
        // The lit nodes are never occluded by the sphere. They are the
        // interactive layer, so they stay fully rendered and hoverable on the
        // far face too — depth only nudges the radius, never the visibility.
        // Drawing them after the cloud keeps them on top of it.
        nextHits.push({ i, x: s.x, y: s.y });

        const isHover = hoverRef.current === i;
        const pulse = reduced ? 1 : 0.82 + 0.18 * Math.sin(t / 1500 + s.x);
        const r = (4.8 + depth * 2.2) * pulse * (isHover ? 1.4 : 1);

        const glow = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 5);
        glow.addColorStop(0, n.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.globalAlpha = isHover ? 0.7 : 0.5;
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r * 5, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.globalAlpha = 1;
        ctx!.fillStyle = n.color;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx!.fill();

        // Hot centre — reads as a lit source rather than a flat disc, and keeps
        // the mark separable from the point cloud crossing behind it.
        ctx!.globalAlpha = 0.85;
        ctx!.fillStyle = "#ffffff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r * 0.34, 0, Math.PI * 2);
        ctx!.fill();

        if (isHover) {
          ctx!.globalAlpha = 0.9;
          ctx!.strokeStyle = n.color;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.globalAlpha = 1;
      });
      hits.current = nextHits;

      frame = requestAnimationFrame(draw);
    }

    resize();
    frame = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [points, nodes]);

  /* ------------------------------------------------------------- hovering */
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    let found: number | null = null;
    // Generous radius: the marks are a few pixels across and the globe turns
    // under the cursor, so an exact target would be unusable.
    let best = 20;
    for (const hit of hits.current) {
      const d = Math.hypot(hit.x - mx, hit.y - my);
      if (d < best) {
        best = d;
        found = hit.i;
      }
    }
    setHover((prev) => {
      if (found === null) return null;
      if (prev && prev.i === found && prev.x === mx && prev.y === my) return prev;
      return { i: found, x: mx, y: my };
    });
  }

  const active = hover ? nodes[hover.i] : null;

  return (
    <div
      className={cn("relative size-full", className)}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={ref} aria-hidden="true" className="size-full" />

      {active && hover && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap border border-line-strong bg-base/95 px-3 py-2 backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y - 16 }}
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: active.color }}
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
              {active.label}
            </span>
          </span>
          <span className="mt-1 block text-[11px] text-ink-3">{active.detail}</span>
        </div>
      )}
    </div>
  );
}
