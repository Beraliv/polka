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
docker compose up --build
```

Starts both containers:
- **Client** — nginx serving the built SPA at `http://localhost:8080` (override with `CLIENT_PORT`), proxying `/api` to the server internally
- **Server** — the built Node.js API, on `http://localhost:3001` (override with `SERVER_PORT`)

Docker Compose reads a `.env` file in the repo root automatically (see `.env.example`) — use it for `SMB_CONFIG_ENCRYPTION_KEY`, `ALLOWED_ORIGIN`, etc.

This isn't a hot-reloading dev server: after changing code, stop it (`Ctrl+C`) and re-run `docker compose up --build` to see the change. Tests and type checking below still run directly with the local Node install, not through Docker.

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

## Before committing

After submitting all changes, always run:

```bash
pnpm format
```

Then verify tests pass:

```bash
pnpm test
```

## Commit style

Follow the phase naming from the plan:

- `feat:` — new user-facing feature
- `fix:` — bug fix
- `chore:` — tooling, config, deps
- `docs:` — documentation only
- `test:` — tests only
- `refactor:` — no behaviour change
