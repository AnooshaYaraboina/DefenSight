import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";
import { emitBurst, getLiveStatus, startLiveTraffic, stopLiveTraffic } from "@/lib/runtime/live-traffic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Controls the estate traffic generator that feeds the live monitor. */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "simulator:run");

    const body = (await request.json().catch(() => ({}))) as {
      action?: "start" | "stop" | "burst";
      intervalMs?: number;
      attackRate?: number;
      count?: number;
    };

    switch (body.action) {
      case "start":
        return NextResponse.json(
          startLiveTraffic({ intervalMs: body.intervalMs, attackRate: body.attackRate }),
        );
      case "stop":
        return NextResponse.json(stopLiveTraffic());
      case "burst":
        return NextResponse.json(await emitBurst(body.count ?? 3, body.attackRate ?? 0.3));
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return apiError(error, "Request failed");
  }
}

export async function GET() {
  return NextResponse.json(getLiveStatus());
}
