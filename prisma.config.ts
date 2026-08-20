import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI runs outside Next.js, so it does not inherit the framework's
// automatic .env loading. Load it explicitly before the config is evaluated.
loadEnv({ path: path.join(process.cwd(), ".env"), quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "npx tsx scripts/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./defensight.db",
  },
});
