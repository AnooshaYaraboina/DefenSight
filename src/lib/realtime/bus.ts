import "server-only";
import type { Decision, Severity, ThreatType } from "@/lib/engine/taxonomy";

/**
 * In-process event bus backing the live monitor (§7).
 *
 * Server-Sent Events rather than WebSockets: the traffic is strictly one-way
 * (server → console), SSE reconnects automatically, and it survives proxies
 * that mangle WebSocket upgrades. A security console that silently stops
 * updating is worse than one that visibly reconnects.
 *
 * The bus is cached on globalThis because Next.js hot-reloads modules in
 * development; without it, each edit would strand every open stream.
 */

export interface LiveEvent {
  type: "security_event" | "alert" | "incident" | "approval" | "document_scan" | "heartbeat";
  id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface LiveSecurityEvent {
  id: string;
  ref: string;
  createdAt: string;
  application: string;
  applicationSlug: string;
  agent?: string;
  model?: string;
  user: string;
  userRole: string;
  request: string;
  riskScore: number;
  severity: Severity;
  decision: Decision;
  threatTypes: ThreatType[];
  blocked: boolean;
  redacted: boolean;
  detectionCount: number;
  toolCallCount: number;
  /*
   * Slugs of the tools this request actually reached. The war-room map draws a
   * packet all the way to the tool surface, and guessing which tool from the
   * agent's grants would be a fiction repeated on the most prominent element
   * of the product — so the truth travels with the event.
   */
  toolSlugs?: string[];
  retrievalCount: number;
  latencyMs: number;
  /** Label of the pipeline stage that stopped this request, when one did. */
  stoppedAt?: string;
  simulated: boolean;
  summary: string;
}

type Subscriber = (event: LiveEvent) => void;

class EventBus {
  private subscribers = new Set<Subscriber>();
  /** Replay buffer so a client that connects mid-stream is not staring at nothing. */
  private recent: LiveEvent[] = [];
  private readonly maxRecent = 60;

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  publish(event: LiveEvent): void {
    this.recent.push(event);
    if (this.recent.length > this.maxRecent) this.recent.shift();

    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // A failing subscriber must not stop the others from being notified.
      }
    }
  }

  getRecent(limit = 25): LiveEvent[] {
    return this.recent.slice(-limit);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

const globalForBus = globalThis as unknown as { defensightBus?: EventBus };
export const bus = globalForBus.defensightBus ?? new EventBus();
if (process.env.NODE_ENV !== "production") globalForBus.defensightBus = bus;

export function publishSecurityEvent(event: LiveSecurityEvent): void {
  bus.publish({
    type: "security_event",
    id: event.id,
    timestamp: event.createdAt,
    payload: event as unknown as Record<string, unknown>,
  });
}

export function publishAlert(alert: {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  category: string;
  incidentRef?: string;
}): void {
  bus.publish({
    type: "alert",
    id: alert.id,
    timestamp: new Date().toISOString(),
    payload: alert,
  });
}

export function publishIncident(incident: {
  id: string;
  ref: string;
  title: string;
  severity: Severity;
  threatType: string;
}): void {
  bus.publish({
    type: "incident",
    id: incident.id,
    timestamp: new Date().toISOString(),
    payload: incident,
  });
}

export function publishApproval(approval: {
  id: string;
  toolName: string;
  agentName: string;
  riskScore: number;
}): void {
  bus.publish({
    type: "approval",
    id: approval.id,
    timestamp: new Date().toISOString(),
    payload: approval,
  });
}
