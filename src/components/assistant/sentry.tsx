"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { SentrySvg } from "./sentry-svg";
import type { SentryState } from "./sentry-state";

export type { SentryState } from "./sentry-state";

/**
 * Sentry — the assistant's character.
 *
 * Two renderers behind one name. The 3D rig is the one people see on the
 * assistant surfaces; the flat SVG remains for the launcher avatar and for
 * anyone whose browser or preference says no.
 *
 * The dynamic boundary is not an optimisation, it is load-bearing. The dock is
 * mounted on every console route by `(console)/layout.tsx`, and it imports this
 * module statically — so a plain `import "three"` here would land the whole
 * library in the shared layout chunk of every dashboard, incident and approvals
 * page. `ssr: false` is legal because this file is itself a Client Component;
 * Next's own docs are explicit that the option only works from one.
 */
const Sentry3D = dynamic(() => import("./sentry-3d"), { ssr: false });

/** Below this the robot is an avatar, and 3D buys no pixels worth the download. */
const MIN_3D_SIZE = 140;

let webglSupport: boolean | null = null;

function probeWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    /* Release it immediately — the probe must not hold one of the browser's
       small number of contexts open for the life of the page. */
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webglSupport = Boolean(gl);
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const store = {
  subscribe(onChange: () => void) {
    if (typeof matchMedia !== "function") return () => {};
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  },
  /* Must be cheap and referentially stable — useSyncExternalStore calls it on
     every render. The WebGL probe memoises after the first call. */
  getSnapshot() {
    return probeWebGL();
  },
  /* False on the server, so SSR emits the flat character and hydration matches
     exactly. The store then flips on the client and the 3D chunk loads. */
  getServerSnapshot() {
    return false;
  },
};

export function Sentry({
  state = "idle",
  size = 320,
  className,
  render = "auto",
}: {
  state?: SentryState;
  size?: number;
  className?: string;
  /** Escape hatch, additive. Nothing in the app passes it today. */
  render?: "auto" | "3d" | "svg";
}) {
  const capable = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const want3D =
    render === "3d" || (render === "auto" && capable && size >= MIN_3D_SIZE);

  return want3D ? (
    <Sentry3D state={state} size={size} className={className} />
  ) : (
    <SentrySvg state={state} size={size} className={className} />
  );
}
