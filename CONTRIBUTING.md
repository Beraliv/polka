# Contributing

## Prerequisites

- **Node.js 24** — use `.nvmrc` via `nvm use`
- **pnpm 11** — enabled via `corepack enable pnpm`

## Setup

```bash
nvm use                 # switch to Node 24
corepack enable pnpm    # activate pnpm
pnpm install            # install all workspace deps
```

## Running locally

```bash
pnpm dev
```

Starts both apps in parallel:
- **Client** — Vite dev server at `http://localhost:3000` (HMR enabled)
- **Server** — Node 24 with `--watch --experimental-strip-types` at `http://localhost:3001`

The client Vite config proxies `/api` requests to the server, so you only need to open `http://localhost:3000`.

## Project structure

```
polka/
├── apps/
│   ├── client/          # SolidJS SPA
│   │   └── src/
│   │       ├── components/   # HomePage, ReaderPage, SettingsPage, BookCard, FileBrowser
│   │       ├── lib/          # epub, fb2, paginate, progress, api, bookId
│   │       └── store/        # books.ts — SolidJS store (books + SMB config + in-memory pages)
│   └── server/          # Fastify API
│       └── src/
│           ├── routes/  # smb.ts, progress.ts
│           └── lib/     # smb-client.ts
└── packages/
    └── shared/          # shared TypeScript types (Book, Progress, SMBConfig, …)
```

## Testing

```bash
pnpm test   # runs Vitest in all packages
```

## Type checking

```bash
pnpm --filter @polka/client exec tsc --noEmit
pnpm --filter @polka/server exec tsc --noEmit
```

## Building

```bash
pnpm build          # builds shared → client → server in order
docker compose build # builds Docker images
```

## Commit style

Follow the phase naming from the plan:

- `feat:` — new user-facing feature
- `fix:` — bug fix
- `chore:` — tooling, config, deps
- `docs:` — documentation only
- `test:` — tests only
- `refactor:` — no behaviour change
