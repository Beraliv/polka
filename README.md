# Polka

A mobile-first e-book reader for EPUB and FB2 files, designed to run on TrueNAS. Browse your NAS book collection over SMB, or open files directly from your device. Progress is saved locally and optionally synced to the server.

## Features

- Read **EPUB** and **FB2** books
- **Open local files** directly from your device — no upload needed
- **Browse your NAS** via SMB and open books remotely
- **Progress sync** — saves to localStorage and optionally to the server
- **Mobile-first** — swipe left/right to turn pages; keyboard arrows and spacebar also work
- **Page-based rendering** — only the current page is in the DOM, so even large books stay fast
- **Dark theme** — easy on the eyes for night reading
- **Installable on TrueNAS SCALE** via Docker Compose

## Quick start (local dev)

**Prerequisites:** Node 24, pnpm 11

```bash
git clone https://github.com/Beraliv/polka
cd polka
pnpm install
pnpm dev        # client → http://localhost:3000  server → http://localhost:3001
```

Open `http://localhost:3000`, tap **+** to open a local `.epub` or `.fb2` file.

## NAS / TrueNAS deployment

```bash
docker compose up --build -d
```

The client is served on **port 80**. API requests are proxied from nginx to the Node.js server on port 3001.

Progress JSON files are stored in a named Docker volume (`progress_data`) mounted at `/data/progress` inside the server container. Override the path with the `PROGRESS_PATH` env var.

### TrueNAS SCALE

1. Go to **Apps → Custom App**
2. Paste the contents of `docker-compose.yml`
3. Add a host-path volume for persistent progress storage if desired

## SMB setup

1. Open the app and go to **Settings (⚙)**
2. Enter your NAS IP, port (default 445), username, password, and share name
3. Tap **Test Connection** to verify, then **Save**
4. Back on the home screen, tap **Browse NAS** to pick a book

The password is never written to disk — it lives in memory for the session only.

## Tech stack

| Layer | Choice |
|-------|--------|
| Client | SolidJS + Vite |
| Server | Node.js 24 (native TypeScript) + Fastify |
| EPUB parsing | fflate + DOMParser |
| FB2 parsing | DOMParser (FB2 is XML) |
| SMB | @marsaud/smb2 |
| Container | Docker + nginx |
