# Single app now (see README's "Consolidated MVP"), so this Dockerfile no
# longer needs the old multi-service APP_NAME templating.
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
# Migration runs against the *compiled* data-source (plain `node`, no
# ts-node/tsconfig-paths/source tree needed at runtime — the previous
# per-service Dockerfile ran this against the TS source instead, which
# would have failed: the old final stage never copied `apps/` in at all).
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/apps/pawmates-api/apps/pawmates-api/src/infra/persistence/data-source.js && node dist/apps/pawmates-api/apps/pawmates-api/src/main.js"]
