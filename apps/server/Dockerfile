FROM node:24-alpine
WORKDIR /app

RUN corepack enable pnpm

# Copy manifests for layer-cached install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --filter @polka/server...

# Copy source — Node 24 runs TypeScript directly via --experimental-strip-types
COPY packages/shared/src ./packages/shared/src
COPY apps/server/src ./apps/server/src

ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001

CMD ["node", "--experimental-strip-types", "apps/server/src/index.ts"]
