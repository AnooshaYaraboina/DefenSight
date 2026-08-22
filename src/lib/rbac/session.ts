import "server-only";
import { redirect } from "next/navigation";
import type { Classification, Role } from "@/lib/engine/taxonomy";
import { readSession } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  /** Highest classification this person may be shown. */
  clearance: Classification;
}

/**
 * The acting user for the current request.
 *
 * Redirects to sign-in when there is no valid session, so every console page
 * and every API route is authenticated by construction rather than by
 * remembering to check.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect("/login");
  return user;
}

/** Non-redirecting variant, for routes that must return JSON on failure. */
export async function getCurrentUserOrNull(): Promise<SessionUser | null> {
  return readSession();
}

/**
 * Raised when an API route is reached without a valid session.
 *
 * Route handlers must not use `getCurrentUser` for this: `redirect()` throws a
 * NEXT_REDIRECT signal, and a route that wraps its body in try/catch swallows
 * that signal and reports it as a 500 with the framework's internal marker as
 * the error message. A caller then cannot tell "you are not signed in" from
 * "the server broke". This is the typed equivalent, mapped to 401 by
 * `apiError`.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "UnauthorizedError";
  }
}

/** The acting user for an API route. Throws rather than redirecting. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) throw new UnauthorizedError();
  return user;
}
