"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * What Sentry is saying, tethered to its mouth.
 *
 * The reveal is paced, not uniform. A flat interval types straight through a
 * full stop, which is the single thing that makes a typewriter read as a
 * machine printing rather than someone talking — so punctuation holds.
 *
 * The caller must give it enough time to finish. `typingDuration()` is
 * exported for exactly that: the console derives each step's dwell from it
 * instead of guessing, because a dwell shorter than the reveal truncates the
 * sentence mid-word.
 */

/** ms per character. */
const TICK = 28;
/** Extra ticks held on punctuation, so clauses land. */
const BEATS: Record<string, number> = {
  ".": 7, "!": 7, "?": 7, "…": 7,
  ",": 3, ";": 3, ":": 3, "—": 3,
};

export function typingDuration(text: string): number {
  if (!text) return 0;
  let ticks = text.length;
  for (const ch of text) ticks += BEATS[ch] ?? 0;
  return ticks * TICK;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function SpeechBubble({
  text,
  onDone,
  tone = "neutral",
  className,
}: {
  text: string;
  onDone?: () => void;
  tone?: "neutral" | "alarm" | "good" | "ask";
  className?: string;
}) {
  const [shown, setShown] = React.useState(0);

  /*
   * No reset here. The caller keys this component on `text`, so a new line
   * mounts a fresh instance and `shown` starts at 0 on its own — which avoids
   * both the setState-in-effect rule and the race a deferred reset created,
   * where the reset landed after the first characters had already typed.
   */
  React.useEffect(() => {
    if (!text) return;

    // Nothing should crawl for someone who asked for less motion.
    if (reducedMotion()) {
      const id = window.setTimeout(() => {
        setShown(text.length);
        onDone?.();
      }, 0);
      return () => window.clearTimeout(id);
    }

    let i = 0;
    let hold = 0;
    const id = window.setInterval(() => {
      if (hold > 0) {
        hold -= 1;
        return;
      }
      i += 1;
      setShown(i);
      hold = BEATS[text[i - 1]] ?? 0;
      if (i >= text.length) {
        window.clearInterval(id);
        onDone?.();
      }
    }, TICK);
    return () => window.clearInterval(id);
  }, [text, onDone]);

  if (!text) return null;

  return (
    <div
      className={cn(
        "ds-sy-bubble relative min-w-[12rem] max-w-[26rem] rounded-2xl border px-4 py-3",
        "shadow-xl shadow-black/40 backdrop-blur-sm",
        tone === "alarm" && "border-critical/45 bg-critical-dim/35",
        tone === "good" && "border-allow/45 bg-allow-dim/35",
        tone === "ask" && "border-medium/45 bg-medium-dim/35",
        tone === "neutral" && "border-line-strong bg-elevated/92",
        className,
      )}
    >
      {/*
        The full line is laid out invisibly so the bubble takes its final size
        on the first frame. Without it the box grows a character at a time and
        judders through every sentence.
      */}
      <p className="pointer-events-none invisible select-none text-[13px] leading-relaxed" aria-hidden>
        {text}
      </p>
      <p className="absolute inset-0 px-4 py-3 text-[13px] leading-relaxed text-ink">
        {text.slice(0, shown)}
        {shown < text.length && (
          <span className="ds-sy-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-brand" />
        )}
      </p>

      {/* Tail, pointing down toward the mouth. */}
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-[7px] left-9 size-3.5 rotate-45 border-b border-r",
          tone === "alarm" && "border-critical/45 bg-critical-dim/35",
          tone === "good" && "border-allow/45 bg-allow-dim/35",
          tone === "ask" && "border-medium/45 bg-medium-dim/35",
          tone === "neutral" && "border-line-strong bg-elevated/92",
        )}
      />
    </div>
  );
}
