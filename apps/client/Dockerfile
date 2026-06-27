# Build stage
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable pnpm

# Copy manifests for layer-cached install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/

RUN pnpm install --frozen-lockfile --filter @polka/client...

# Copy source and build
COPY packages/shared/src ./packages/shared/src
COPY apps/client ./apps/client

RUN pnpm --filter @polka/client build

# Serve stage
FROM nginx:alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
