"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight, ChevronDown, Maximize2, Send, Sparkles, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";

/**
 * The assistant, docked.
 *
 * A security assistant that lives on its own page is one an analyst has to
 * leave their investigation to reach — so it goes unused. Docking it means the
 * question can be asked from wherever the question occurred, with the answer
 * appearing beside the evidence that prompted it.
 *
 * Collapsed it is a single pill. Expanded it is a real conversation surface.
 * State is held here rather than in a route, so navigating the console does not
 * end the conversation.
 */

interface Answer {
  answer: string;
  fromModel: boolean;
  sources: Array<{ label: string; href?: string; detail: string }>;
}

interface Turn {
  question: string;
  answer?: Answer;
  error?: string;
}

const QUICK_ASKS = [
  "What were the most serious threats today?",
  "Which agent has the highest risk?",
  "What is waiting for my approval?",
  "Which documents are quarantined and why?",
];

export function AssistantDock({ configured }: { configured: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy, open]);

  // ⌘K / Ctrl-K opens it from anywhere, because that is where the muscle
  // memory already is.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setTurns((prev) => [...prev, { question: trimmed }]);
    setQuestion("");
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Assistant failed");
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, answer: data } : t)));
    } catch (error) {
      setTurns((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1
            ? { ...t, error: error instanceof Error ? error.message : "Assistant failed" }
            : t,
        ),
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // On the assistant's own page the dock would be a second copy of itself.
  if (pathname?.startsWith("/assistant")) return null;

  return (
    <>
      {/* ------------------------------------------------------- launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full py-2.5 pl-3 pr-4",
            "border border-brand/30 bg-elevated/95 backdrop-blur-md",
            "shadow-lg shadow-black/40 transition-all duration-200",
            "hover:border-brand/50 hover:shadow-xl hover:shadow-brand/10",
          )}
          aria-label="Open the security assistant"
        >
          <span className="relative flex size-7 items-center justify-center rounded-full bg-brand-dim/60">
            <Sparkles className="size-3.5 text-brand" />
            <span className="ds-live-dot absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-allow text-allow/40" />
          </span>
          <span className="text-xs font-medium text-ink">Ask DefenSight</span>
          <kbd className="rounded border border-line-strong bg-inset px-1 font-mono text-[9px] text-ink-4">
            ⌘K
          </kbd>
        </button>
      )}

      {/* ----------------------------------------------------------- panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Security assistant"
          className={cn(
            "fixed bottom-5 right-5 z-40 flex w-[min(26rem,calc(100vw-2.5rem))] flex-col",
            "h-[min(34rem,calc(100dvh-6rem))] overflow-hidden rounded-xl",
            "border border-line-strong bg-elevated",
            "shadow-2xl shadow-black/60 ds-rise",
          )}
        >
          <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <span className="flex size-6 items-center justify-center rounded-md border border-brand/25 bg-brand-dim/50">
              <Logo size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">Security assistant</p>
              <p className="flex items-center gap-1.5 text-[10px] text-ink-4">
                <span className={cn("size-1 rounded-full", configured ? "bg-allow" : "bg-ink-4")} />
                {configured ? "Model connected" : "Deterministic"} · read-only
              </p>
            </div>
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

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            {turns.length === 0 ? (
              <div className="py-4">
                <p className="text-[11px] leading-relaxed text-ink-3">
                  Ask about anything the platform has recorded. Answers cite what they were
                  computed from.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {QUICK_ASKS.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => ask(q)}
                        className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-left text-[11px] text-ink-3 transition-colors hover:border-brand/40 hover:text-ink"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-2.5">
                    <div className="flex justify-end">
                      <p className="max-w-[88%] rounded-lg rounded-br-sm bg-brand-dim/40 px-3 py-2 text-[11px] leading-relaxed text-ink ring-1 ring-inset ring-brand/20">
                        {turn.question}
                      </p>
                    </div>

                    {turn.error ? (
                      <p className="rounded-lg rounded-tl-sm border border-critical/30 bg-critical-dim/25 px-3 py-2 text-[11px] text-critical">
                        {turn.error}
                      </p>
                    ) : turn.answer ? (
                      <div>
                        <p className="whitespace-pre-wrap rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-ink-2">
                          {turn.answer.answer}
                        </p>
                        {turn.answer.sources.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {turn.answer.sources.slice(0, 3).map((s) =>
                              s.href ? (
                                <Link
                                  key={s.label}
                                  href={s.href}
                                  title={s.detail}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[9px] text-ink-4 transition-colors hover:border-brand/40 hover:text-brand"
                                >
                                  {s.label}
                                  <ArrowUpRight className="size-2" />
                                </Link>
                              ) : (
                                <span
                                  key={s.label}
                                  className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[9px] text-ink-4"
                                >
                                  {s.label}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2.5">
                        <span className="flex gap-1">
                          {[0, 1, 2].map((d) => (
                            <span
                              key={d}
                              className="size-1 animate-pulse rounded-full bg-brand"
                              style={{ animationDelay: `${d * 160}ms` }}
                            />
                          ))}
                        </span>
                        <span className="text-[10px] text-ink-4">Reading security data…</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-line p-2.5">
            <div className="relative rounded-lg border border-line-strong bg-surface transition-colors focus-within:border-brand/50">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(question);
                  }
                }}
                rows={1}
                disabled={busy}
                placeholder="Ask about threats, agents, documents…"
                className="w-full resize-none bg-transparent py-2.5 pl-3 pr-11 text-[11px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
              />
              <button
                type="button"
                onClick={() => ask(question)}
                disabled={!question.trim() || busy}
                aria-label="Send"
                className={cn(
                  "absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-md transition-colors",
                  question.trim() && !busy
                    ? "bg-brand text-brand-ink hover:bg-brand/90"
                    : "bg-surface-2 text-ink-4",
                )}
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { X };
