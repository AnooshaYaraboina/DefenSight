import { NextResponse } from "next/server";
import { askAssistant } from "@/lib/ai/assistant";
import { getCurrentUser } from "@/lib/rbac/session";
import { assertCan, ForbiddenError } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    assertCan(user.role, "assistant:use");

    const { question } = (await request.json()) as { question?: string };
    if (!question?.trim()) {
      return NextResponse.json({ error: "A question is required." }, { status: 400 });
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: "Question is too long." }, { status: 413 });
    }

    const answer = await askAssistant(question.trim());
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant failed" },
      { status: 500 },
    );
  }
}
