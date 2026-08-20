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
  const url = process.env.DATABASE_URL ?? "file:./prisma/defensight.db";
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
