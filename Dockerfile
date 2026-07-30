# Builds any one of the 14 apps in this monorepo, selected via APP_NAME
# (docker-compose passes it as a build arg per service). Every app compiles
# to the same shape — dist/apps/<name>/apps/<name>/src/main.js — because
# every apps/*/tsconfig.app.json pins rootDir to the repo root, so this
# Dockerfile never needs per-service path special-casing.
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP_NAME
RUN npx nest build ${APP_NAME}

FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
ARG APP_NAME
ENV APP_NAME=${APP_NAME}
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/libs/proto/src ./libs/proto/src
CMD ["sh", "-c", "node dist/apps/${APP_NAME}/apps/${APP_NAME}/src/main.js"]
