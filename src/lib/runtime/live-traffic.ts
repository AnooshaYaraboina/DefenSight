import "server-only";
import { prisma } from "@/lib/db";
import { ingest } from "./ingest";
import { ATTACK_TRAFFIC, BENIGN_TRAFFIC } from "../../../scripts/traffic";

/**
 * Live traffic generator.
 *
 * Drives the AI estate so the console has something to monitor. Every request
 * goes through the real pipeline, so what appears on the dashboard is a genuine
 * verdict — this simulates the *estate*, never the defence.
 *
 * Cached on globalThis so a hot reload does not leave an orphaned interval
 * running alongside the new one.
 */

interface LiveState {
  timer?: NodeJS.Timeout;
  running: boolean;
  emitted: number;
  startedAt?: Date;
}

const globalForLive = globalThis as unknown as { defensightLive?: LiveState };
const state: LiveState = globalForLive.defensightLive ?? { running: false, emitted: 0 };
globalForLive.defensightLive = state;

const RANK: Record<string, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

async function emitOne(attackRate: number) {
  const [users, docs] = await Promise.all([
    prisma.user.findMany({ where: { role: "VIEWER" }, select: { id: true, email: true, clearance: true } }),
    prisma.document.findMany({ select: { id: true, title: true, classification: true } }),
  ]);
  if (users.length === 0) return;

  const docByTitle = new Map(docs.map((d) => [d.title, d]));
  const resolve = (titles?: string[]) =>
    titles?.map((t) => docByTitle.get(t)?.id).filter((id): id is string => Boolean(id));

  const requesterFor = (documentIds?: string[]) => {
    if (!documentIds?.length) return pick(users).id;
    const required = Math.max(
      ...documentIds.map((id) => RANK[docs.find((d) => d.id === id)?.classification ?? "PUBLIC"] ?? 0),
    );
    const eligible = users.filter((u) => (RANK[u.clearance] ?? 0) >= required);
    return (eligible.length ? pick(eligible) : pick(users)).id;
  };

  if (Math.random() < attackRate) {
    const attack = weightedPick(ATTACK_TRAFFIC);
    const named = attack.user ? users.find((u) => u.email === attack.user)?.id : undefined;
    const documentIds = resolve(attack.docTitles);
    await ingest({
      userId: named ?? requesterFor(documentIds),
      applicationSlug: attack.app,
      agentSlug: attack.agent,
      input: attack.prompt,
      output: attack.output,
      retrievedDocumentIds: documentIds,
      proposedToolCalls: attack.tools?.map((t, index) => ({
        toolSlug: t.slug, operation: t.operation, arguments: t.args, index,
      })),
      scenarioKey: attack.key,
    });
  } else {
    const pattern = pick(BENIGN_TRAFFIC);
    const documentIds = resolve(pattern.docTitles ? [pick(pattern.docTitles)] : undefined);
    await ingest({
      userId: requesterFor(documentIds),
      applicationSlug: pattern.app,
      agentSlug: pattern.agent,
      input: pick(pattern.prompts),
      // A reply as well as a request, so the output stages screen real text.
      output: pattern.responses ? pick(pattern.responses) : undefined,
      retrievedDocumentIds: documentIds,
      proposedToolCalls: pattern.tools?.map((t, index) => ({
        toolSlug: t.slug, operation: t.operation, arguments: t.args, index,
      })),
    });
  }
  state.emitted++;
}

export function startLiveTraffic(options: { intervalMs?: number; attackRate?: number } = {}) {
  if (state.running) return getLiveStatus();

  const interval = Math.max(1500, options.intervalMs ?? 4000);
  const attackRate = options.attackRate ?? 0.18;

  state.running = true;
  state.startedAt = new Date();
  state.timer = setInterval(() => {
    // Jitter so the stream does not arrive on a metronome, which reads as fake.
    const delay = Math.random() * interval * 0.6;
    setTimeout(() => {
      emitOne(attackRate).catch(() => {
        /* a single failed request must not stop the generator */
      });
    }, delay);
  }, interval);

  return getLiveStatus();
}

export function stopLiveTraffic() {
  if (state.timer) clearInterval(state.timer);
  state.timer = undefined;
  state.running = false;
  return getLiveStatus();
}

export function getLiveStatus() {
  return {
    running: state.running,
    emitted: state.emitted,
    startedAt: state.startedAt?.toISOString() ?? null,
  };
}

/** Emit a single request immediately, for the "generate traffic" button. */
export async function emitBurst(count = 1, attackRate = 0.25) {
  for (let i = 0; i < count; i++) {
    await emitOne(attackRate);
  }
  return getLiveStatus();
}
