# Installing Polka on TrueNAS SCALE

Polka runs as a two-container custom app on TrueNAS SCALE: the client (nginx serving the SPA and proxying `/api`) and the server (Node.js). Because the containers must share a network — nginx proxies to the hostname `server` — the app is installed with **Install via YAML**, not the single-container Custom App form wizard.

## Prerequisites

- TrueNAS SCALE **24.10 (Electric Eel) or newer** — these versions run apps on Docker and support compose YAML. See the [official custom app docs](https://apps.truenas.com/managing-apps/installing-custom-apps/).
- An apps pool configured (**Apps → Settings → Choose Pool**).
- A dataset (or directory) on a pool for the reading-progress files, e.g. `/mnt/<pool>/apps/polka/progress` (**Datasets → Add Dataset**).

TrueNAS pulls the prebuilt images [`beraliv/polka-server`](https://hub.docker.com/r/beraliv/polka-server) and [`beraliv/polka-client`](https://hub.docker.com/r/beraliv/polka-client), published to Docker Hub by CI (`linux/amd64`); it does not build from source.

## 1. Install via YAML

1. In the TrueNAS UI, go to **Apps → Discover Apps**.
2. Open the **⋮** menu next to the **Custom App** button and choose **Install via YAML**.
3. Set **Name** to `polka` and paste the config below (replace `/mnt/<pool>/apps/polka/progress` with your dataset path):

```yaml
services:
  client:
    depends_on:
      - server
    image: beraliv/polka-client:latest
    ports:
      - '8080:80'
    restart: unless-stopped
  server:
    environment:
      HOST: 0.0.0.0
      PORT: '3001'
      PROGRESS_PATH: /data/progress
    image: beraliv/polka-server:latest
    restart: unless-stopped
    volumes:
      - /mnt/<pool>/apps/polka/progress:/data/progress
```

4. Click **Save**. TrueNAS pulls the images and starts both containers; the app appears as **Running** under **Apps → Installed**.

Differences from the repo's `docker-compose.yml`, and why:

- **Client on `8080:80`, not `80:80`** — the TrueNAS web UI occupies port 80/443, so binding 80 fails. Any free port works.
- **No `ports:` on the server** — nginx in the client container proxies `/api` to `server:3001` over the internal network, so the API never needs host exposure.
- **Host path for progress, not a named volume** — reading progress is stored as JSON files, and mounting a dataset path keeps them visible on the pool, easy to back up (snapshots/replication), and safe across app reinstalls. A named Docker volume (what `docker-compose.yml` uses) would hide them inside Docker's storage and tie them to the app's lifecycle.

## 2. Verify

- Open `http://<nas-ip>:8080` — the Polka home screen should load.
- API smoke test: `curl http://<nas-ip>:8080/api/progress/test` should return `{"error":"not found"}` — the server answering through the nginx proxy.

## 3. Use it

- Add a book with **Browse files**, or configure SMB browsing under **Settings (⚙)** — use the NAS's real IP, port 445, and your share credentials, then **Test Connection** and **Save**.

## Updating

New images are published to Docker Hub automatically by CI whenever an app's version is bumped on `main`. To update, hit **Update** on the app in **Apps → Restart App** to pull the new `:latest`.

## Debugging

Logs, version checks, API smoke tests, and common failures are covered in [truenas-debugging.md](./truenas-debugging.md).

## Known limitations

- **PWA install requires HTTPS.** Over plain `http://<nas-ip>:8080` the service worker will not register, so "Add to Home Screen" offline support is unavailable. Reading works fine. To fix, serve the app through HTTPS — e.g. a reverse proxy with a certificate
