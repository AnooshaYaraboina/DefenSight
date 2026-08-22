import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/rbac/permissions";
import { UnauthorizedError } from "@/lib/rbac/session";

/**
 * Turns a thrown error into the right JSON response.
 *
 * Every write route shares the same three outcomes — not signed in, signed in
 * but not permitted, or genuinely broken — and each one used to spell that out
 * itself. Centralising it means a route cannot accidentally report a missing
 * session as a server fault, which is exactly what happened while every
 * handler called the redirecting `getCurrentUser`.
 *
 * `fallback` is used only when the thrown value carries no message of its own.
 */
export function apiError(error: unknown, fallback: string): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
