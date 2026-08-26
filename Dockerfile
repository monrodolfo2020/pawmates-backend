# Builds all 15 apps in this monorepo into one shared image; which one a
# given container actually runs is selected purely at *runtime* via the
# APP_NAME env var (not a build arg) — so every service, on Docker Compose
# or on a host like Render with no build-arg-per-service support, uses this
# exact same image. Every app compiles to the same shape —
# dist/apps/<name>/apps/<name>/src/main.js — because every
# apps/*/tsconfig.app.json pins rootDir to the repo root, so this
# Dockerfile never needs per-service path special-casing.
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
COPY --from=builder /usr/src/app/libs/proto/src ./libs/proto/src
CMD ["sh", "-c", "node dist/apps/${APP_NAME}/apps/${APP_NAME}/src/main.js"]
