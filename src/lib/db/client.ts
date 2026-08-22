import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * SQLite handle on every edit until the process runs out of file descriptors.
 * Caching on globalThis keeps exactly one connection per process.
 */
const globalForPrisma = globalThis as unknown as {
  defensightPrisma?: PrismaClient;
};

function createClient() {
  // Must match the default in prisma.config.ts. These disagreed — the CLI
  // seeded ./defensight.db while this pointed at ./prisma/defensight.db — so
  // any script importing this client outside Next silently opened an empty
  // database and reported missing tables while the running app was fine.
  const url = process.env.DATABASE_URL ?? "file:./defensight.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? [{ level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }]
        : [{ level: "error", emit: "stdout" }],
  });
}

export const prisma = globalForPrisma.defensightPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.defensightPrisma = prisma;
}
