"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useChartSize } from "@/components/charts/primitives";
import type { MapEdge, MapNode } from "@/lib/queries/warroom";
import type { LiveSecurityEvent } from "@/lib/realtime/bus";

/**
 * The estate, live.
 *
 * Four lanes — where a request enters, the application it hits, the agent that
 * handles it, and the tool surface it reaches. Every edge is a real relation
 * (an agent's parent application, a granted tool), and every packet is a real
 * request that arrived on the stream.
 *
 * The point of the whole thing is the moment a packet stops moving and
 * detonates: that is a request the pipeline refused, shown where it was
 * refused. A number on a card cannot say that.
 *
 * Packets are HTML on an overlay rather than SVG children. CSS motion path on
 * an SVG element depends on `transform-box` and resolves differently across
 * engines; on a positioned div the path is unambiguously the containing
 * block's pixel space — which is exactly the SVG's own space here, because the
 * SVG is sized 1:1 in pixels with no viewBox scaling.
 *
 * The path itself reaches CSS as a custom property. React 19 drops an
 * `offsetPath` style key on the floor; see globals.css.
 */

const LANE_X = [0.05, 0.28, 0.53, 0.78];
const LANE_TITLES = ["Ingress", "Applications", "Agents", "Tool surface"];
const PAD_TOP = 26;
const PAD_BOTTOM = 12;

/*
 * Three packet states, not five.
 *
 * The five decision colours fail colour-vision separation at this size — as
 * 6px marks they sat at ΔE 5.2 deuteranope between approval and redact. These
 * three measure ΔE 20.3 deuteranope, 27.0 normal, against the wall's ground.
 *
 * It is also simply the better design: a wall read from across a room cannot
 * resolve five hues, and three map onto the only question it answers — is
 * anything getting through that shouldn't? The exact decision is on the wire
 * and in the monitor.
 */
type PacketState = "cleared" | "modified" | "stopped";

const PACKET: Record<PacketState, { color: string; hollow: boolean }> = {
  cleared: { color: "var(--color-accent)", hollow: false },
  modified: { color: "var(--color-medium)", hollow: true },
  stopped: { color: "var(--color-critical)", hollow: false },
};

function stateFor(decision: string, blocked: boolean): PacketState {
  if (blocked || decision === "BLOCK") return "stopped";
  if (decision === "REDACT" || decision === "REQUIRE_APPROVAL") return "modified";
  return "cleared";
}

interface Packet {
  key: string;
  path: string;
  state: PacketState;
  blocked: boolean;
  endX: number;
  endY: number;
  duration: number;
  born: number;
}

interface Blast {
  key: string;
  x: number;
  y: number;
}

export function EstateMap({
  nodes,
  edges,
  agentsByName,
  toolNodeBySlug,
  events,
  className,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  agentsByName: Record<string, string>;
  toolNodeBySlug: Record<string, string>;
  events: LiveSecurityEvent[];
  className?: string;
}) {
  const { ref, width, height } = useChartSize<HTMLDivElement>();
  const [packets, setPackets] = React.useState<Packet[]>([]);
  const [blasts, setBlasts] = React.useState<Blast[]>([]);
  const [flares, setFlares] = React.useState<Record<string, number>>({});
  const seen = React.useRef<Set<string>>(new Set());
  const primed = React.useRef(false);

  const ready = width > 40 && height > 40;

  /* ------------------------------------------------------------- geometry */
  const placed = layout(nodes, width, height, ready);

  const edgePaths = ready
    ? edges
        .map((e) => {
          const a = placed.get(e.from);
          const b = placed.get(e.to);
          return a && b ? { key: `${e.from}->${e.to}`, d: curve(a, b) } : null;
        })
        .filter(Boolean)
    : [];

  /* -------------------------------------------------------------- packets */
  React.useEffect(() => {
    if (!ready || events.length === 0) return;
    const placed = layout(nodes, width, height, true);

    const fresh: Packet[] = [];
    const touched: string[] = [];

    // The stream replays its recent buffer on connect. Those already happened,
    // so they seed the picture without animating — twenty packets detonating
    // at once on load would read as an incident, not as history.
    if (!primed.current) {
      primed.current = true;
      for (const e of events) seen.current.add(e.id);
      return;
    }

    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);

      const hops = ["ingress"];
      const app = `app:${e.applicationSlug}`;
      if (placed.has(app)) hops.push(app);

      const agentId = e.agent ? agentsByName[e.agent] : undefined;
      if (agentId && placed.has(agentId)) hops.push(agentId);

      const toolId = e.toolSlugs?.length ? toolNodeBySlug[e.toolSlugs[0]] : undefined;
      if (toolId && placed.has(toolId)) hops.push(toolId);

      if (hops.length < 2) continue;

      const pts = hops.map((h) => placed.get(h)!);
      // One M, then one C per hop. Slicing the leading M off a full `curve()`
      // and joining leaves a stray coordinate pair between segments, which
      // makes the whole path unparseable — and CSS fails an invalid
      // `offset-path` silently, so the packet just never moves.
      const d =
        `M${pts[0].x},${pts[0].y} ` +
        pts.slice(1).map((to, i) => segment(pts[i], to)).join(" ");
      const end = pts[pts.length - 1];

      fresh.push({
        key: `${e.id}:${seen.current.size}`,
        path: d,
        state: stateFor(e.decision, e.blocked),
        blocked: e.blocked,
        endX: end.x,
        endY: end.y,
        duration: 0.75 + hops.length * 0.18,
        born: performance.now(),
      });
      touched.push(...hops);
    }

    if (fresh.length === 0) return;

    // Memory only grows with distinct event ids; cap it so a long-running wall
    // does not accumulate a set of every event it ever saw.
    if (seen.current.size > 600) seen.current = new Set([...seen.current].slice(-200));

    /*
     * Deferred rather than set synchronously — this effect runs during commit
     * and the codebase forbids setState in an effect body. A timeout, not
     * requestAnimationFrame: rAF is suspended entirely while a window is
     * unfocused or occluded, so a wall on a second monitor would quietly stop
     * spawning anything. A timeout keeps firing.
     */
    const id = window.setTimeout(() => {
      setPackets((prev) => [...prev, ...fresh].slice(-24));
      setFlares((prev) => {
        const next = { ...prev };
        const stamp = performance.now();
        for (const nodeId of touched) next[nodeId] = stamp;
        return next;
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [events, ready, nodes, width, height, agentsByName, toolNodeBySlug]);

  React.useEffect(() => {
    if (packets.length === 0) return;
    // Sweep anything that outlived its animation by a wide margin. Cheap, and
    // it means a packet can never become permanent scenery.
    const id = window.setInterval(() => {
      const cutoff = performance.now() - 4000;
      setPackets((prev) => prev.filter((p) => p.born > cutoff));
    }, 2000);
    return () => window.clearInterval(id);
  }, [packets.length]);

  function retire(packet: Packet) {
    setPackets((prev) => prev.filter((p) => p.key !== packet.key));
    if (!packet.blocked) return;
    const blast = { key: packet.key, x: packet.endX, y: packet.endY };
    setBlasts((prev) => [...prev, blast].slice(-8));
    window.setTimeout(
      () => setBlasts((prev) => prev.filter((b) => b.key !== blast.key)),
      700,
    );
  }

  return (
    <section className={cn("ds-panel relative flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3">
        <p className="ds-eyebrow">The estate — live</p>
        <p className="text-[10px] text-ink-4">
          every packet is a real request · blocked ones detonate where they were stopped
        </p>
      </div>

      <div ref={ref} className="relative min-h-0 flex-1">
        {ready && (
          <>
            <svg width={width} height={height} className="absolute inset-0" aria-hidden>
              {/* Lane titles */}
              {LANE_TITLES.map((t, i) => (
                <text
                  key={t}
                  x={LANE_X[i] * width}
                  y={14}
                  className="fill-ink-4"
                  style={{ fontSize: 9, letterSpacing: "0.11em", textTransform: "uppercase" }}
                >
                  {t.toUpperCase()}
                </text>
              ))}

              {edgePaths.map((e) => (
                <path
                  key={e!.key}
                  d={e!.d}
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
              ))}

              {[...placed.values()].map(({ x, y, node }) => {
                const danger = node.risk === "HIGH" || node.risk === "CRITICAL";
                const flared = flares[node.id];
                return (
                  <g key={node.id}>
                    {danger && (
                      <circle
                        cx={x} cy={y} r={11}
                        fill="none"
                        stroke="var(--color-critical)"
                        strokeWidth={1}
                        opacity={0.45}
                      />
                    )}
                    <circle
                      key={`${node.id}:${flared ?? 0}`}
                      cx={x} cy={y}
                      r={node.lane === 0 ? 6 : 4.5}
                      className={cn(
                        flared && "ds-node-flare",
                        danger ? "text-critical" : node.lane === 3 ? "text-ink-3" : "text-brand",
                      )}
                      fill="currentColor"
                    />
                    <text
                      x={x + 10}
                      y={y + 3}
                      className={cn("fill-ink-3", danger && "fill-critical")}
                      style={{ fontSize: 9.5 }}
                    >
                      {clip(node.label)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Packets and detonations ride an overlay so motion path is in
                unambiguous pixel space. */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {packets.map((p) => {
                const mark = PACKET[p.state];
                return (
                  <span
                    key={p.key}
                    className="ds-packet absolute left-0 top-0 block rounded-full"
                    style={{
                      width: mark.hollow ? 8 : 6,
                      height: mark.hollow ? 8 : 6,
                      marginLeft: mark.hollow ? -4 : -3,
                      marginTop: mark.hollow ? -4 : -3,
                      background: mark.hollow ? "transparent" : mark.color,
                      border: mark.hollow ? `1.5px solid ${mark.color}` : "none",
                      boxShadow: `0 0 8px ${mark.color}`,
                      // See .ds-packet in globals.css for why this is a
                      // custom property rather than an offsetPath key.
                      ["--ds-path" as string]: `path("${p.path}")`,
                      ["--ds-packet-dur" as string]: `${p.duration}s`,
                    }}
                    onAnimationEnd={() => retire(p)}
                  />
                );
              })}

              {blasts.map((b) => (
                <span
                  key={b.key}
                  className="ds-detonate absolute block rounded-full border-2"
                  style={{
                    left: b.x,
                    top: b.y,
                    width: 56,
                    height: 56,
                    borderColor: "var(--color-viz-block)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Lane layout. Pure and deterministic, so a node never jumps between renders
 * and the effect can rebuild it from the same inputs without the render's Map
 * becoming an effect dependency.
 */
function layout(
  nodes: MapNode[],
  width: number,
  height: number,
  ready: boolean,
): Map<string, { x: number; y: number; node: MapNode }> {
  const placed = new Map<string, { x: number; y: number; node: MapNode }>();
  if (!ready) return placed;
  const usable = height - PAD_TOP - PAD_BOTTOM;
  for (let lane = 0; lane < 4; lane++) {
    const inLane = nodes.filter((n) => n.lane === lane);
    const x = LANE_X[lane] * width;
    inLane.forEach((n, i) => {
      const y = PAD_TOP + ((i + 0.5) * usable) / inLane.length;
      placed.set(n.id, { x, y, node: n });
    });
  }
  return placed;
}

/** Horizontal S-curve. Every edge runs strictly left to right, which is what
 *  keeps ~50 of them legible without any routing logic. */
function curve(a: Point, b: Point): string {
  return `M${a.x},${a.y} ${segment(a, b)}`;
}

/** The cubic on its own, so multi-hop paths can chain M C C C. */
function segment(a: Point, b: Point): string {
  const dx = (b.x - a.x) * 0.5;
  return `C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

interface Point {
  x: number;
  y: number;
}

function clip(label: string): string {
  return label.length > 17 ? `${label.slice(0, 16)}…` : label;
}
