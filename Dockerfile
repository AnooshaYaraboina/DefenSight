# =============================================================================
# DefenSight — container image
#
# Next.js 16 + Prisma 7 over better-sqlite3. better-sqlite3 is a native module,
# so the install stage carries a toolchain; the runtime stage does not.
#
# The seeded database ships inside the image at /app/seed and is copied onto a
# volume at /app/data on first boot, so restarts keep their data and the repo's
# committed defensight.db is never written to.
# =============================================================================

# ---- deps: install node_modules (native build + `prisma generate`) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 falls back to compiling from source when no prebuild matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# `postinstall` runs `prisma generate`, which needs the schema and config present.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- builder: compile the Next.js app --------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Produced by `prisma generate` in the deps stage; excluded from the context.
COPY --from=deps /app/src/generated ./src/generated

# Prerendering touches the database, so point at the committed copy for the build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/app/defensight.db"
ENV SESSION_SECRET="build-time-only-secret-not-used-at-runtime"
RUN npm run build

# ---- runner: what actually ships -------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/defensight.db"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./

# Pristine seeded database, copied onto the volume on first boot.
COPY --from=builder /app/defensight.db /app/seed/defensight.db

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'mkdir -p /app/data' \
  'if [ ! -f /app/data/defensight.db ]; then' \
  '  echo "[defensight] seeding /app/data/defensight.db from image"' \
  '  cp /app/seed/defensight.db /app/data/defensight.db' \
  'fi' \
  'exec "$@"' \
  > /usr/local/bin/entrypoint.sh \
 && chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /app/data && chown -R node:node /app/data /app/.next
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
