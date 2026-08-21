"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantConsole } from "@/components/assistant/assistant-console";
import { AgentAvatar } from "@/components/assistant/agent-avatar";

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
          <AgentAvatar state="idle" size={30} />
          <span className="text-xs font-medium text-ink">Ask Sentry</span>
          <kbd className="rounded border border-line-strong bg-inset px-1 font-mono text-[9px] text-ink-4">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Security assistant"
          className={cn(
            "fixed bottom-5 right-5 z-40 flex w-[min(30rem,calc(100vw-2.5rem))] flex-col",
            "h-[min(40rem,calc(100dvh-5rem))] overflow-hidden rounded-xl",
            "border border-line-strong bg-elevated shadow-2xl shadow-black/60 ds-rise",
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <span className="ds-eyebrow flex-1">Security assistant</span>
            <Link
              href="/assistant"
              className="rounded p-1 text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Open full assistant"
            >
              <Maximize2 className="size-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Close assistant"
            >
              <ChevronDown className="size-4" />
            </button>
          </header>

          <AssistantConsole configured={configured} variant="dock" className="min-h-0 flex-1" />
        </div>
      )}
    </>
  );
}
