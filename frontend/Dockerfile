# Node 22 (was 20). Node 20 reached end-of-life, GitHub's runners emit
# deprecation warnings for actions targeting it, and undici 8 — which the
# SSRF connection pinning in lib/server/pinnedFetch.ts would otherwise use —
# requires >= 22.19. Keep this in step with .github/workflows/ci.yml's
# setup-node and with package.json's `engines` field.
# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# This repo has no public/ directory (Next doesn't require one). The standalone
# server serves ./public when present, so create an empty one; switch back to
# `COPY --from=builder /app/public ./public` if the directory is ever added.
RUN mkdir ./public

# Leverage output standalone traces for minimal image
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The app persists runtime config (.provider-config.json, .agent-prompts.json,
# .exchange-credentials.json) into the app root at request time. /app itself is
# created root-owned by WORKDIR, so the non-root user gets EACCES on every
# write (observed live: /live-data/markets logging EACCES). Non-recursive chown
# of the directory entry is enough for nextjs to create files in it. NOTE:
# writes to the container filesystem are ephemeral — mount a volume over these
# files for any deployment that should keep UI-saved keys across restarts.
RUN chown nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
