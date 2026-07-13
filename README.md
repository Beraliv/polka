# Polka

A mobile-first e-book reader for EPUB and FB2 files, designed to run on TrueNAS. Browse your NAS book collection over SMB, or open files directly from your device. Progress is saved locally and optionally synced to the server.

## Features

- Read **EPUB** and **FB2** books
- **Open local files** directly from your device — no upload needed
- **Browse your NAS** via SMB and open books remotely
- **Books persist across reloads** — stored in IndexedDB, no re-download needed
- **Progress sync** — saved to IndexedDB and optionally synced to the server
- **Footnote popups** — tap inline references to read notes without leaving the page
- **Mobile-first** — swipe left/right to turn pages; keyboard arrows and spacebar also work
- **Two-page spread on desktop** — wide screens (≥900px) show two pages side by side, like an open book
- **Page-based rendering** — only the current page is in the DOM, so even large books stay fast
- **Dark theme** — easy on the eyes for night reading
- **Installable as a PWA** — add to home screen; app shell works offline
- **Installable on TrueNAS SCALE** via Docker Compose

## Quick start (local dev)

```bash
git clone https://github.com/Beraliv/polka
cd polka
nvm install                         # installs recommended node version (unless it's already installed)
nvm use                             # chooses recommended node version
kill $(lsof -ti :3000 -ti :3001)    # stop previous runs
pnpm install
pnpm dev                            # client → http://localhost:3000  server → http://localhost:3001
```

Open `http://localhost:3000`, tap **+** to open a local `.epub` or `.fb2` file.

## NAS / TrueNAS deployment

```bash
docker compose up --build -d
```

The client is served on **port 80**. API requests are proxied from nginx to the Node.js server on port 3001.

Progress JSON files are stored in a named Docker volume (`progress_data`) mounted at `/data/progress` inside the server container. Override the path with the `PROGRESS_PATH` env var.

### TrueNAS SCALE

Polka installs as a two-container custom app via **Install via YAML** (the single-container Custom App form doesn't fit), pulling the CI-published `beraliv/polka-server` and `beraliv/polka-client` images from Docker Hub — full steps in the **[TrueNAS guide](docs/truenas.md)**.

## Install as PWA

### iOS (Safari)

1. Open the app URL in **Safari**
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down and tap **Add to Home Screen**
4. Confirm the name and tap **Add**

### Android (Chrome)

1. Open the app URL in **Chrome**
2. Tap the **⋮** menu → **Add to Home screen** (or tap the install prompt in the address bar)
3. Tap **Add**

The app opens full-screen without browser chrome. Books and progress are stored on-device in IndexedDB and available offline.

## SMB setup

1. Open the app and go to **Settings (⚙)**
2. Enter your NAS IP, port (default 445), username, password, and share name
3. Tap **Test Connection** to verify, then **Save**
4. Back on the home screen, tap **Browse NAS** to pick a book

The password is saved to localStorage so the NAS reconnects automatically on reload. Books downloaded from the NAS are cached in IndexedDB and reopen instantly without re-downloading.

## Tech stack

| Layer | Choice |
|-------|--------|
| Client | SolidJS + Vite |
| Server | Node.js 24 (native TypeScript) + Fastify |
| EPUB parsing | fflate + DOMParser |
| FB2 parsing | DOMParser (FB2 is XML) |
| SMB | @marsaud/smb2 |
| Persistence | IndexedDB (idb) |
| PWA | vite-plugin-pwa + Workbox |
| Container | Docker + nginx |
