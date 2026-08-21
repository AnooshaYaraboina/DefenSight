"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bot, CornerDownLeft, FileWarning, Gauge, RotateCcw,
  Send, Siren, Sparkles, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

/**
 * Question categories.
 *
 * Presented as cards rather than a row of chips: an empty chat is the moment a
 * user decides whether the thing is useful, and "here are five grey pills"
 * answers that badly. Each card names a domain and shows what asking about it
 * actually looks like.
 */
const CATEGORIES = [
  {
    icon: Siren,
    label: "Threats & incidents",
    accent: "var(--color-viz-block)",
    questions: [
      "What were the most serious threats today?",
      "Show me the open incidents",
    ],
  },
  {
    icon: Bot,
    label: "Agents",
    accent: "var(--color-viz-6)",
    questions: [
      "Which agent has the highest risk?",
      "Which agents had requests blocked?",
    ],
  },
  {
    icon: FileWarning,
    label: "Documents",
    accent: "var(--color-viz-2)",
    questions: [
      "Which documents are quarantined and why?",
      "What did we ingest from external sources?",
    ],
  },
  {
    icon: UserCheck,
    label: "My queue",
    accent: "var(--color-viz-1)",
    questions: [
      "What is waiting for my approval?",
      "Who are the highest-risk users?",
    ],
  },
] as const;

export function AssistantChat({
  configured,
  context,
}: {
  configured: boolean;
  context: { events: number; incidents: number; quarantined: number; approvals: number };
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

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

  const started = turns.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------------------------------ transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!started ? (
          <Welcome context={context} onAsk={ask} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-1 py-2">
            {turns.map((turn, i) => (
              <Exchange key={i} turn={turn} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ----------------------------------------------------------- input */}
      <div className="shrink-0 pt-4">
        <div className="mx-auto max-w-3xl">
          {started && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {CATEGORIES.slice(0, 3).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => ask(c.questions[0])}
                  disabled={busy}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-4 transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
                >
                  {c.questions[0]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTurns([])}
                className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-4 transition-colors hover:text-ink-2"
              >
                <RotateCcw className="size-3" />
                New conversation
              </button>
            </div>
          )}

          <div
            className={cn(
              "relative rounded-[0.875rem] border bg-surface transition-colors",
              busy ? "border-brand/40" : "border-line-strong focus-within:border-brand/50",
            )}
          >
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
              rows={2}
              placeholder="Ask about threats, incidents, agents, documents or approvals…"
              disabled={busy}
              className="w-full resize-none bg-transparent px-4 pb-11 pt-3.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-4"
            />

            <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[10px] text-ink-4">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                    configured
                      ? "border-allow/30 bg-allow-dim/40 text-allow"
                      : "border-line-strong bg-surface-2 text-ink-4",
                  )}
                >
                  <span className={cn("size-1 rounded-full", configured ? "bg-allow" : "bg-ink-4")} />
                  {configured ? "Model connected" : "Deterministic"}
                </span>
                <span className="hidden sm:inline">Reads your security data. Cannot take actions.</span>
              </span>

              <span className="flex items-center gap-2">
                <span className="hidden items-center gap-1 text-[10px] text-ink-4 sm:flex">
                  <CornerDownLeft className="size-3" />
                  send
                </span>
                <Button
                  size="sm"
                  loading={busy}
                  disabled={!question.trim()}
                  onClick={() => ask(question)}
                >
                  {!busy && <Send />}
                  Ask
                </Button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- welcome --- */

function Welcome({
  context,
  onAsk,
}: {
  context: { events: number; incidents: number; quarantined: number; approvals: number };
  onAsk: (q: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-1 py-10">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 blur-2xl"
          style={{ background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)", opacity: 0.35 }}
        />
        <div className="flex size-14 items-center justify-center rounded-2xl border border-brand/30 bg-brand-dim/40">
          <Sparkles className="size-7 text-brand" />
        </div>
      </div>

      <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
        Ask about your security data
      </h2>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-ink-3">
        Answers come from recorded events, incidents, agents and documents — with the sources
        shown, so you can verify rather than trust.
      </p>

      {/* What the assistant can actually see, stated up front. */}
      <dl className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <ContextStat label="events" value={context.events} />
        <ContextStat label="open incidents" value={context.incidents} />
        <ContextStat label="quarantined" value={context.quarantined} />
        <ContextStat label="approvals pending" value={context.approvals} />
      </dl>

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <div
            key={category.label}
            className="group relative overflow-hidden rounded-[0.875rem] border border-line bg-surface p-4 transition-all hover:border-line-strong"
          >
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-12 size-28 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25"
              style={{ background: `radial-gradient(circle, ${category.accent} 0%, transparent 70%)` }}
            />
            <div className="relative flex items-center gap-2.5">
              <div
                className="flex size-7 items-center justify-center rounded-lg border"
                style={{
                  borderColor: `color-mix(in oklab, ${category.accent} 35%, transparent)`,
                  background: `color-mix(in oklab, ${category.accent} 12%, transparent)`,
                }}
              >
                <category.icon className="size-3.5" style={{ color: category.accent }} />
              </div>
              <h3 className="text-xs font-semibold text-ink">{category.label}</h3>
            </div>

            <ul className="relative mt-3 space-y-1">
              {category.questions.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => onAsk(q)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] leading-relaxed text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <span className="min-w-0 flex-1">{q}</span>
                    <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="font-mono text-sm font-semibold tabular text-ink-2">{value.toLocaleString()}</dd>
      <dt className="text-[11px] text-ink-4">{label}</dt>
    </div>
  );
}

/* ------------------------------------------------------------ exchange --- */

function Exchange({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[0.875rem] rounded-br-sm bg-brand-dim/40 px-4 py-2.5 text-sm leading-relaxed text-ink ring-1 ring-inset ring-brand/20">
          {turn.question}
        </p>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand-dim/40">
          <Logo size={15} />
        </span>

        <div className="min-w-0 flex-1">
          {turn.error ? (
            <p className="rounded-[0.875rem] rounded-tl-sm border border-critical/30 bg-critical-dim/25 px-4 py-3 text-sm text-critical">
              {turn.error}
            </p>
          ) : turn.answer ? (
            <>
              <div className="rounded-[0.875rem] rounded-tl-sm border border-line bg-surface px-4 py-3.5">
                <p className="whitespace-pre-wrap text-sm leading-[1.7] text-ink-2">
                  {turn.answer.answer}
                </p>
              </div>

              {turn.answer.sources.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[10px] text-ink-4">
                    <Gauge className="size-3" />
                    computed from
                  </span>
                  {turn.answer.sources.map((s) =>
                    s.href ? (
                      <Link
                        key={s.label}
                        href={s.href}
                        title={s.detail}
                        className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[10px] text-ink-3 transition-colors hover:border-brand/40 hover:text-brand-text"
                      >
                        {s.label}
                        <ArrowUpRight className="size-2.5" />
                      </Link>
                    ) : (
                      <span
                        key={s.label}
                        title={s.detail}
                        className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[10px] text-ink-3"
                      >
                        {s.label}
                      </span>
                    ),
                  )}
                  {!turn.answer.fromModel && (
                    <span className="text-[10px] text-ink-4">· computed, not generated</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2.5 rounded-[0.875rem] rounded-tl-sm border border-line bg-surface px-4 py-3.5">
              <span className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-pulse rounded-full bg-brand"
                    style={{ animationDelay: `${d * 160}ms` }}
                  />
                ))}
              </span>
              <span className="text-xs text-ink-4">Reading your security data…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
