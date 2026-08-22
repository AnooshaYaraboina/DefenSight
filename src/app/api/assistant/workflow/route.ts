import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { can } from "@/lib/rbac/permissions";
import { planFor, runStep, type WorkflowId } from "@/lib/assistant/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan, then step.
 *
 * Two actions on one route rather than a streamed generator: a workflow that
 * pauses for human authorisation would otherwise need server-held state for
 * every in-flight conversation. Letting the client drive keeps the server
 * stateless and makes the pause free.
 *
 * Nothing here mutates. Write steps return a *description* of what they would
 * do; carrying it out means calling the same endpoint every human uses, with
 * the same permission check, after an explicit click.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();

    const body = (await request.json()) as {
      action: "plan" | "step";
      message?: string;
      workflow?: WorkflowId;
      step?: string;
      params?: Record<string, string>;
      carry?: Record<string, string>;
    };

    if (body.action === "plan") {
      const plan = planFor(body.message ?? "");
      if (!plan) return NextResponse.json({ plan: null });

      // Surfacing the gate up front means the user sees where they will be
      // asked before anything starts, rather than being ambushed mid-run.
      const writeSteps = plan.steps.filter((s) => s.kind === "write").length;
      return NextResponse.json({
        plan,
        gated: writeSteps,
        canWrite: can(user.role, "incidents:write"),
      });
    }

    if (body.action === "step") {
      if (!body.workflow || !body.step) {
        return NextResponse.json({ error: "workflow and step are required" }, { status: 400 });
      }
      const result = await runStep(
        body.workflow,
        body.step,
        body.params ?? {},
        body.carry ?? {},
      );
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return apiError(error, "Workflow failed");
  }
}
