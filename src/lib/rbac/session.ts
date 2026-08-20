import "server-only";
import type { Role } from "@/lib/engine/taxonomy";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

/**
 * Resolves the acting user for the current request.
 *
 * Phase 9 replaces this body with signed-cookie session lookup against the
 * database. Every caller already treats the result as untrusted-until-checked
 * and runs it through `assertCan`, so swapping the implementation does not
 * change a single call site.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  return {
    id: "usr_admin_seed",
    name: "Security Administrator",
    email: "soc-admin@northwind.example",
    role: "SECURITY_ADMIN",
    department: "Security Operations",
  };
}
