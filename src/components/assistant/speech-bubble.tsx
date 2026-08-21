"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * What Sentry is saying, tethered to its mouth.
 *
 * The text types rather than appearing, and the caller holds `speaking` until
 * `onDone` fires — that is what keeps the mouth moving for exactly as long as
 * there are words left, instead of for a fixed guess.
 */
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
   * both the setState-in-effect rule and the race the deferred reset created,
   * where the reset landed after the first few characters had already typed.
   */
  React.useEffect(() => {
    if (!text) return;

    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDone?.();
      }
      // Punctuation gets a beat. Typing straight through a full stop is the
      // main thing that makes a typewriter effect feel mechanical.
    }, 16);
    return () => window.clearInterval(id);
  }, [text, onDone]);

  if (!text) return null;

  return (
    <div
      className={cn(
        "relative min-w-[12rem] max-w-[26rem] rounded-2xl border px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-sm",
        tone === "alarm" && "border-critical/45 bg-critical-dim/35",
        tone === "good" && "border-allow/45 bg-allow-dim/35",
        tone === "ask" && "border-medium/45 bg-medium-dim/35",
        tone === "neutral" && "border-line-strong bg-elevated/92",
        className,
      )}
    >
      {/*
        The full text is laid out invisibly so the bubble takes its final size
        on the first frame. Without it the box grows a character at a time and
        the whole thing judders while Sentry talks.
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
