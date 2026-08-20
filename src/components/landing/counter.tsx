"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Count-up figure.
 *
 * Runs once when the element scrolls into view. Honours reduced-motion by
 * rendering the final value immediately — an animated number is decoration, and
 * decoration should never be what makes a figure unreadable.
 */
export function Counter({
  value,
  suffix,
  decimals = 0,
  className,
  duration = 1200,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = React.useState(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Deferred so the state update is not synchronous inside the effect body,
      // which would force a second render pass before paint.
      const id = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(value * eased);
          if (progress < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
