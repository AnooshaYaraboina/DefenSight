"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantConsole } from "@/components/assistant/assistant-console";
import { Sentry } from "@/components/assistant/sentry";

/**
 * Sentry, docked.
 *
 * An assistant that lives on its own page is one an analyst has to leave their
 * investigation to reach, so it goes unused. Docking it means the question can
 * be asked from wherever the question occurred.
 *
 * The dock owns only the launcher, the shortcut and the panel chrome. The
 * conversation is the shared console, so this and the full page cannot drift.
 * Conversation state lives inside that component, which stays mounted across
 * navigation — walking to another screen does not end the thread.
 */
export function AssistantDock({ configured }: { configured: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // On the assistant's own page the dock would be a second copy of itself.
  if (pathname?.startsWith("/assistant")) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4",
            "border border-brand/30 bg-elevated/95 backdrop-blur-md",
            "shadow-lg shadow-black/40 transition-all duration-200",
            "hover:border-brand/50 hover:shadow-xl hover:shadow-brand/10",
          )}
          aria-label="Open the security assistant"
        >
          <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-brand-dim/50">
            <Sentry state="idle" size={52} className="translate-y-[6px]" />
          </span>
          <span className="text-xs font-medium text-ink">Ask Sentry</span>
          <kbd className="rounded border border-line-strong bg-inset px-1 font-mono text-[9px] text-ink-4">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Security assistant"
          className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
        <div
          className={cn(
            "ds-rise flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl",
            "h-[min(46rem,calc(100dvh-2rem))]",
            "border border-line-strong bg-surface shadow-2xl shadow-black/70",
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <span className="ds-eyebrow flex-1">Security assistant</span>
            <kbd className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-4">esc</kbd>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </button>
          </header>

          <AssistantConsole configured={configured} variant="page" className="min-h-0 flex-1" />
        </div>
        </div>
      )}
    </>
  );
}
