/**
 * Role-based access control (assessment §24).
 *
 * Permissions are checked server-side in every API route; the UI uses the same
 * matrix only to hide controls the user cannot use. Hiding a button is a
 * usability affordance, never the enforcement boundary.
 */
import type { Role } from "@/lib/engine/taxonomy";

export const PERMISSIONS = [
  // Read
  "dashboard:read",
  "events:read",
  "events:investigate",
  "applications:read",
  "agents:read",
  "rag:read",
  "tools:read",
  "policies:read",
  "guardrails:read",
  "incidents:read",
  "alerts:read",
  "analytics:read",
  "audit:read",
  "assistant:use",
  // Operate
  "incidents:write",
  "alerts:acknowledge",
  "approvals:decide",
  "documents:quarantine",
  "documents:upload",
  "simulator:run",
  "agents:suspend",
  // Administer
  "policies:write",
  "guardrails:write",
  "tools:write",
  "applications:write",
  "agents:write",
  "users:manage",
  "settings:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ANALYST_PERMISSIONS: Permission[] = [
  "dashboard:read",
  "events:read",
  "events:investigate",
  "applications:read",
  "agents:read",
  "rag:read",
  "tools:read",
  "policies:read",
  "guardrails:read",
  "incidents:read",
  "alerts:read",
  "analytics:read",
  "audit:read",
  "assistant:use",
  "incidents:write",
  "alerts:acknowledge",
  "approvals:decide",
  "documents:quarantine",
  "documents:upload",
  "simulator:run",
  "agents:suspend",
];

const VIEWER_PERMISSIONS: Permission[] = [
  "dashboard:read",
  "events:read",
  "applications:read",
  "agents:read",
  "rag:read",
  "tools:read",
  "policies:read",
  "guardrails:read",
  "incidents:read",
  "alerts:read",
  "analytics:read",
  "assistant:use",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SECURITY_ADMIN: PERMISSIONS,
  SECURITY_ANALYST: ANALYST_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** Thrown by API routes when a caller lacks the required permission. */
export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
