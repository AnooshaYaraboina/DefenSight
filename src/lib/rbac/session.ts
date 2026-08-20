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
