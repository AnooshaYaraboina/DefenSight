"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SentryState } from "../sentry-state";
import { Director } from "./director";

/**
 * The React surface for the 3D character: one div, and nothing else.
 *
 * No state, no per-frame render. The state prop reaches the loop through a
 * method call on a ref, which is both the only sane way to drive twenty
 * channels at 60fps and the only way that satisfies the repo's lint rule
 * against setState inside an effect body.
 */
export default function Sentry3D({
  state = "idle",
  size = 320,
  className,
}: {
  state?: SentryState;
  size?: number;
  className?: string;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const directorRef = React.useRef<Director | null>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let director: Director;
    try {
      director = new Director(host);
    } catch {
      /* A context that fails to create is not worth an error boundary — the
         façade already renders the flat character when WebGL is missing, and
         this only catches the rarer mid-session failure. */
      return;
    }
    directorRef.current = director;
    director.resize(host.clientWidth, host.clientHeight);
    director.start();

    /* A handle for driving the states directly in development. Nine states are
       not all reachable through the chat, and stepping through them by hand is
       the only way to check that no two share a silhouette. */
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __sentry?: Director }).__sentry = director;
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      director.resize(width, height);
    });
    ro.observe(host);

    /* The dock panel stays mounted across navigation, so an invisible robot
       burning GPU is a real cost rather than a hypothetical one. */
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) director.start();
      else director.stop();
    });
    io.observe(host);

    const onVisibility = () => {
      if (document.hidden) director.stop();
      else director.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      director.stop();
    };
    host.addEventListener("webglcontextlost", onLost);

    return () => {
      host.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      ro.disconnect();
      director.dispose();
      directorRef.current = null;
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as { __sentry?: Director }).__sentry;
      }
    };
  }, []);

  React.useEffect(() => {
    directorRef.current?.setState(state);
  }, [state]);

  return (
    <div
      ref={hostRef}
      className={cn("relative select-none", className)}
      style={{ width: size, height: size * 1.18 }}
      data-sentry-3d={state}
      role="img"
      aria-label={`Sentry is ${state}`}
    />
  );
}
