"use client";

import * as React from "react";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils/format";
import { deleteSession, listSessions, titleFor, type Session } from "@/lib/assistant/history";

/**
 * Past conversations, on a shelf rather than in the room.
 *
 * A permanent list rail would have taken 240px off the stage, and the stage is
 * the point — Sentry is the interface here, not a column beside a transcript.
 * So history slides over on demand and gets out of the way again.
 */
export function HistoryDrawer({
  open,
  onClose,
  onPick,
  onNew,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (session: Session) => void;
  onNew: () => void;
  currentId?: string;
}) {
  const [sessions, setSessions] = React.useState<Session[]>([]);

  // Read on open rather than on mount: localStorage is not reactive, and the
  // list is stale the moment another turn is recorded behind the drawer.
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setSessions(listSessions()), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" onClick={onClose} />

      <aside className="ds-sy-drawer relative flex h-full w-[19rem] flex-col border-r border-line-strong bg-elevated shadow-2xl shadow-black/60">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="ds-eyebrow flex-1">History</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close history"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="shrink-0 p-2">
          <button
            type="button"
            onClick={() => {
              onNew();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-brand/30 bg-brand-dim/30 px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:border-brand/50"
          >
            <Plus className="size-3.5 text-brand-text" />
            New chat
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-ink-4">
            Nothing saved yet. Conversations appear here once you have asked
            something, and stay in this browser only.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
            {sessions.map((s) => (
              <li key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    onPick(s);
                    onClose();
                  }}
                  className={cn(
                    "w-full rounded-lg border px-2.5 py-2 pr-8 text-left transition-colors",
                    s.id === currentId
                      ? "border-brand/40 bg-brand-dim/25"
                      : "border-transparent hover:border-line-strong hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 size-3 shrink-0 text-ink-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-ink-2">{titleFor(s)}</span>
                      <span className="mt-0.5 block text-[10px] text-ink-4">
                        {formatRelative(new Date(s.updatedAt))} ·{" "}
                        {s.turns.filter((t) => t.user).length} exchange
                        {s.turns.filter((t) => t.user).length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    deleteSession(s.id);
                    setSessions(listSessions());
                  }}
                  className="absolute right-1.5 top-2 rounded p-1 text-ink-4 opacity-0 transition-opacity hover:text-critical group-hover:opacity-100"
                  aria-label={`Delete ${titleFor(s)}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
