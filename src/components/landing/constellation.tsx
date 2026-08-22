"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Constellation field.
 *
 * Long straight lines crossing the full width, meeting at scattered nodes — a
 * faint web behind the hero. Drawn on canvas rather than as SVG because the
 * line count is high and the geometry is regenerated on resize; a few hundred
 * <line> nodes in the DOM would cost more than they are worth for something
 * this quiet.
 *
 * The geometry is generated inside the effect, never during render, so the
 * server and the first client pass agree — random values computed at render
 * time are the classic source of hydration mismatch.
 */
export function Constellation({ className }: { className?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    type Node = { x: number; y: number; r: number };
    let nodes: Node[] = [];
    let links: [number, number][] = [];
    let w = 0;
    let h = 0;

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Nodes sit on a jittered grid so the web stays evenly distributed
      // instead of clumping the way pure random placement does.
      const cols = Math.max(4, Math.round(w / 190));
      const rows = Math.max(3, Math.round(h / 190));
      nodes = [];
      for (let cx = 0; cx <= cols; cx++) {
        for (let cy = 0; cy <= rows; cy++) {
          nodes.push({
            x: (cx / cols) * w + (Math.random() - 0.5) * (w / cols) * 0.75,
            y: (cy / rows) * h + (Math.random() - 0.5) * (h / rows) * 0.75,
            r: Math.random() < 0.14 ? 1.5 : 0,
          });
        }
      }

      // Each node reaches to a few distant others, which is what produces long
      // crossing chords rather than a short-edge mesh.
      links = [];
      for (let i = 0; i < nodes.length; i++) {
        const picks = 2 + Math.floor(Math.random() * 2);
        for (let p = 0; p < picks; p++) {
          const j = Math.floor(Math.random() * nodes.length);
          if (j !== i) links.push([i, j]);
        }
      }
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);

      ctx!.lineWidth = 1;
      for (const [a, b] of links) {
        const n1 = nodes[a];
        const n2 = nodes[b];
        // Slow breathing so the field is alive without ever being motion.
        const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 4200 + a * 0.35);
        ctx!.strokeStyle = `rgba(126, 148, 190, ${0.028 + pulse * 0.028})`;
        ctx!.beginPath();
        ctx!.moveTo(n1.x, n1.y);
        ctx!.lineTo(n2.x, n2.y);
        ctx!.stroke();
      }

      for (const n of nodes) {
        if (!n.r) continue;
        ctx!.fillStyle = "rgba(170, 190, 225, 0.30)";
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!reduced) frame = requestAnimationFrame(draw);
    }

    build();
    frame = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      build();
      if (reduced) draw(0);
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
