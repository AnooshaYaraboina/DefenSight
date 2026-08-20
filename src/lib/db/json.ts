/**
 * Typed accessors for Json columns.
 *
 * SQLite has no primitive-list type, so multi-value fields (threat types, tool
 * operations, allowed domains) are stored as Json arrays. These helpers keep
 * the `unknown`-typed Prisma Json values from leaking into application code.
 */

export function jsonArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function jsonObject<T extends object>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      /* fall through to the caller's default */
    }
  }
  return fallback;
}

/** Prisma rejects `undefined` for Json columns; normalise to Prisma's null. */
export function toJson<T>(value: T | undefined | null): T | null {
  return value === undefined ? null : value;
}
