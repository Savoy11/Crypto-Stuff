# Node 24 "Krypton", the current LTS line (was 22 "Jod", the previous one).
# The SSRF connection pinning in lib/server/pinnedFetch.ts imports the npm
# `undici` package (7.x today); undici 8 declares engines.node >= 22.19, which
# 24 clears with room, so that upgrade stays available.
#
# Track an LTS line, not the newest tag: dependabot proposed 26-alpine (#45),
# but 26 is a Current release with no long-term support, and that PR moved
# only this file, leaving CI on 22 — so nothing would have tested the runtime
# the image actually ships. Keep this in step with .github/workflows/ci.yml's
# setup-node and with package.json's `engines` field.
# Stage 1: Dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# ALL dependencies, not --only=production. The builder stage below reuses this
# node_modules to run `next build`, and the build needs devDependencies —
# @types/node, @types/react and the eslint config among them — to typecheck.
#
# With --only=production, Next 15 detects the missing @types, tries to install
# them mid-build, and the build dies. It survived on Next 14 only because that
# version did not attempt the auto-install. Nothing is bloated by this: the
# final image is built from `output: 'standalone'`, which bundles just the
# modules the server actually needs, so devDependencies never reach the runner.
RUN npm ci && npm cache clean --force

# Stage 2: Builder
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Runner
FROM node:24-alpine AS runner
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
