import "server-only";
import { randomUUID } from "node:crypto";
import { analyze } from "@/lib/engine";
import type { AnalysisResult } from "@/lib/engine/types";
import { prisma } from "@/lib/db";
import { buildAnalysisContext, type ContextRequest } from "./context";
import { persistAnalysis } from "./persist";
import { publishAlert, publishIncident, publishSecurityEvent } from "@/lib/realtime/bus";

/**
 * The single entry point for AI traffic (§26).
 *
 * Assemble context → analyse → persist → broadcast. The attack simulator, the
 * demo scenario and the historical replay all call this, so a result shown
 * anywhere in the console came from the same path as production traffic.
 */

export interface IngestRequest extends Omit<ContextRequest, "requestId"> {
  requestId?: string;
  /** Suppress alert and incident broadcast during bulk replay. */
  quiet?: boolean;
}

export interface IngestResponse {
  requestId: string;
  eventId: string;
  eventRef: string;
  incidentRef?: string;
  result: AnalysisResult;
}

export async function ingest(request: IngestRequest): Promise<IngestResponse> {
  const requestId = request.requestId ?? randomUUID();

  const context = await buildAnalysisContext({ ...request, requestId });
  const result = analyze(context);
  const persisted = await persistAnalysis({ context, result, quiet: request.quiet });

  if (!request.quiet) {
    publishSecurityEvent({
      id: persisted.eventId,
      ref: persisted.eventRef,
      createdAt: context.timestamp.toISOString(),
      application: context.application.name,
      applicationSlug: context.application.slug,
      agent: context.agent?.name,
      model: context.model?.name,
      user: context.principal.name,
      userRole: context.principal.role,
      request: context.input.slice(0, 240),
      riskScore: result.riskScore,
      severity: result.severity,
      decision: result.decision,
      threatTypes: result.threatTypes,
      blocked: result.blocked,
      redacted: result.redacted,
      detectionCount: result.detections.length,
      toolCallCount: result.toolDecisions.length,
      retrievalCount: context.retrievals?.length ?? 0,
      latencyMs: result.latencyMs,
      simulated: Boolean(context.simulated),
      summary: result.summary,
    });

    for (const alertId of persisted.alertIds) {
      const alert = await prisma.alert.findUnique({ where: { id: alertId } });
      if (alert) {
        publishAlert({
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          category: alert.category,
          incidentRef: persisted.incidentRef,
        });
      }
    }

    if (persisted.incidentId && persisted.incidentRef) {
      const incident = await prisma.incident.findUnique({ where: { id: persisted.incidentId } });
      if (incident) {
        publishIncident({
          id: incident.id,
          ref: incident.ref,
          title: incident.title,
          severity: incident.severity,
          threatType: incident.threatType,
        });
      }
    }
  }

  return {
    requestId,
    eventId: persisted.eventId,
    eventRef: persisted.eventRef,
    incidentRef: persisted.incidentRef,
    result,
  };
}
