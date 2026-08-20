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

/**
 * Cast a typed value to Prisma's Json input type.
 *
 * Prisma's `InputJsonValue` requires an index signature, which a declared
 * interface deliberately does not have. Every value passed through here is
 * already JSON-serialisable by construction — these are plain data structures
 * built by the engine — so the assertion is safe. Keeping it in one named
 * helper means the cast is documented once instead of appearing as an
 * unexplained `as never` at every call site.
 */
export function asJson<T>(value: T): never {
  return value as never;
}
