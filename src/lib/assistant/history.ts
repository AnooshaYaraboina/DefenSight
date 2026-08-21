/**
 * Conversation history, kept in the browser.
 *
 * Deliberately not in the database. These transcripts are a convenience for
 * the person at the keyboard, not a system of record — and the things that
 * genuinely need to be recorded already are: every action Sentry carries out
 * goes through the same endpoints as a human and lands in the audit log there.
 * Storing chat server-side would imply an authority this does not have.
 *
 * Everything here tolerates absent, full or corrupt storage. A private window
 * with storage disabled should still let you talk to Sentry; it just will not
 * remember afterwards.
 */

const KEY = "defensight:sentry:sessions";
/** Enough to scroll through, small enough to never approach the quota. */
const MAX_SESSIONS = 40;

export interface TurnLine {
  text: string;
  tone: "neutral" | "alarm" | "good" | "ask";
}

export interface TurnStep {
  label: string;
  status: string;
  summary?: string;
}

export interface Turn {
  id: string;
  at: number;
  /** What the person asked. Empty for Sentry's opening line. */
  user: string;
  lines: TurnLine[];
  workflow?: { title: string; intent: string; steps: TurnStep[] };
}

export interface Session {
  id: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  turns: Turn[];
}

function read(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    // Corrupt or unreadable storage must not take the assistant down with it.
    return [];
  }
}

function write(sessions: Session[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    /* quota or a private window — losing history is not worth an error */
  }
}

export function listSessions(): Session[] {
  return read()
    .filter((s) => s.turns?.some((t) => t.user))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  return read().find((s) => s.id === id) ?? null;
}

export function saveSession(session: Session): void {
  // Nothing worth keeping until the person has actually said something.
  if (!session.turns.some((t) => t.user)) return;
  const rest = read().filter((s) => s.id !== session.id);
  write([{ ...session, updatedAt: Date.now() }, ...rest].sort((a, b) => b.updatedAt - a.updatedAt));
}

export function deleteSession(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function clearSessions(): void {
  write([]);
}

export function newSession(): Session {
  const now = Date.now();
  return { id: `s${now}-${Math.random().toString(36).slice(2, 8)}`, title: "New chat", startedAt: now, updatedAt: now, turns: [] };
}

/** The first thing asked becomes the name, which is what people look for. */
export function titleFor(session: Session): string {
  const first = session.turns.find((t) => t.user)?.user;
  if (!first) return "New chat";
  return first.length > 52 ? `${first.slice(0, 51)}…` : first;
}
