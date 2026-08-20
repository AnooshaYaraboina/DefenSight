"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CornerDownLeft, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/layout/logo";

interface Answer {
  answer: string;
  fromModel: boolean;
  sources: Array<{ label: string; href?: string; detail: string }>;
  suggestions: string[];
}

interface Turn {
  question: string;
  answer?: Answer;
  error?: string;
}

const STARTERS = [
  "What were the most serious threats today?",
  "Which agent has the highest risk?",
  "Show me the open incidents",
  "Which documents are quarantined and why?",
  "What is waiting for my approval?",
];

/**
 * Analyst assistant (§22).
 *
 * Answers are grounded in a pre-computed snapshot of the platform's own data —
 * the assistant has no query access, because an assistant that can query freely
 * is an injection target. Every answer shows what it was computed from so the
 * analyst can verify rather than trust.
 */
export function AssistantChat({ configured }: { configured: boolean }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

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
      setTurns((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, answer: data } : t)),
      );
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
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-brand/25 bg-brand-dim/40">
              <Sparkles className="size-6 text-brand" />
            </div>
            <div className="max-w-md">
              <p className="text-sm font-medium text-ink">Ask about your security data</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
                The assistant answers from recorded events, incidents, agents and documents. It
                reports; it does not take actions or change configuration.
              </p>
            </div>
            <ul className="flex max-w-lg flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-md border border-line bg-surface px-3 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <div className="flex max-w-2xl items-start gap-2.5">
                <p className="rounded-panel rounded-tr-sm border border-line-strong bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink">
                  {turn.question}
                </p>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
                  <User className="size-3 text-ink-4" />
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand-dim/40">
                <Logo size={13} />
              </span>

              <div className="min-w-0 max-w-3xl flex-1">
                {turn.error ? (
                  <p className="rounded-panel border border-critical/30 bg-critical-dim/25 px-3.5 py-2.5 text-xs text-critical">
                    {turn.error}
                  </p>
                ) : turn.answer ? (
                  <div className="rounded-panel rounded-tl-sm border border-line bg-surface px-3.5 py-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-2">
                      {turn.answer.answer}
                    </p>

                    {turn.answer.sources.length > 0 && (
                      <div className="mt-3 border-t border-line pt-2.5">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                          Computed from
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {turn.answer.sources.map((s) => (
                            <li key={s.label}>
                              {s.href ? (
                                <Link
                                  href={s.href}
                                  title={s.detail}
                                  className="inline-flex items-center gap-1 rounded border border-line-strong bg-surface-2 px-2 py-0.5 text-[10px] text-ink-3 transition-colors hover:border-brand/40 hover:text-brand"
                                >
                                  {s.label}
                                  <ArrowUpRight className="size-2.5" />
                                </Link>
                              ) : (
                                <span
                                  title={s.detail}
                                  className="inline-block rounded border border-line-strong bg-surface-2 px-2 py-0.5 text-[10px] text-ink-3"
                                >
                                  {s.label}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!turn.answer.fromModel && (
                      <p className="mt-2.5 text-[10px] text-ink-4">
                        Answered deterministically from the security data. Configure a model to
                        get narrative reasoning over the same figures.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-panel border border-line bg-surface px-3.5 py-2.5">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="size-1.5 animate-pulse rounded-full bg-brand"
                          style={{ animationDelay: `${d * 150}ms` }}
                        />
                      ))}
                    </span>
                    <span className="text-[11px] text-ink-4">Reading security data…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-line pt-3">
        {turns.length > 0 && (
          <ul className="mb-2.5 flex flex-wrap gap-1.5">
            {STARTERS.slice(0, 3).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  disabled={busy}
                  className="rounded border border-line bg-surface px-2 py-1 text-[10px] text-ink-4 transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            placeholder="Ask about threats, incidents, agents, documents or approvals…"
            className="min-h-[3.25rem] resize-none pr-24"
            disabled={busy}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[10px] text-ink-4 sm:flex">
              <CornerDownLeft className="size-3" />
              to send
            </span>
            <Button size="sm" loading={busy} disabled={!question.trim()} onClick={() => ask(question)}>
              Ask
            </Button>
          </div>
        </div>

        <p className="mt-2 flex items-center gap-2 text-[10px] text-ink-4">
          <Badge tone={configured ? "allow" : "neutral"} size="xs">
            {configured ? "Model configured" : "Deterministic mode"}
          </Badge>
          {configured
            ? "Answers are generated over a read-only snapshot of your security data."
            : "Answers are computed directly from your security data. Set OPENAI_API_KEY to enable narrative reasoning."}
        </p>
      </div>
    </div>
  );
}
