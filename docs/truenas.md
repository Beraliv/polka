# Installing Polka on TrueNAS SCALE

Polka runs as a two-container custom app on TrueNAS SCALE: the client (nginx serving the SPA and proxying `/api`) and the server (Node.js). Because the containers must share a network — nginx proxies to the hostname `server` — the app is installed with **Install via YAML**, not the single-container Custom App form wizard.

## Prerequisites

- TrueNAS SCALE **24.10 (Electric Eel) or newer** — these versions run apps on Docker and support compose YAML. See the [official custom app docs](https://apps.truenas.com/managing-apps/installing-custom-apps/).
- An apps pool configured (**Apps → Settings → Choose Pool**).
- A Docker Hub (or other registry) account to host the two images.

## 1. Build and push the images

TrueNAS pulls prebuilt images from a registry; it does not build from source. From the repo root:

```bash
docker login

docker build --platform linux/amd64 -f apps/server/Dockerfile -t <your-user>/polka-server:latest .
docker build --platform linux/amd64 -f apps/client/Dockerfile -t <your-user>/polka-client:latest .

docker push <your-user>/polka-server:latest
docker push <your-user>/polka-client:latest
```

> **`--platform linux/amd64` matters.** TrueNAS machines are almost always x86_64. Images built on an Apple Silicon Mac without this flag are arm64 and will not run on the NAS.

## 2. Install via YAML

1. In the TrueNAS UI, go to **Apps → Discover Apps**.
2. Open the **⋮** menu next to the **Custom App** button and choose **Install via YAML**.
3. Set **Name** to `polka` and paste the config below (replace `<your-user>` with your registry username):

```yaml
services:
  server:
    image: <your-user>/polka-server:latest
    environment:
      PORT: "3001"
      HOST: "0.0.0.0"
      PROGRESS_PATH: /data/progress
    volumes:
      - progress_data:/data/progress
    restart: unless-stopped
  client:
    image: <your-user>/polka-client:latest
    ports:
      - "8080:80"
    depends_on:
      - server
    restart: unless-stopped
volumes:
  progress_data:
```

4. Click **Save**. TrueNAS pulls the images and starts both containers; the app appears as **Running** under **Apps → Installed**.

Differences from the repo's `docker-compose.yml`, and why:

- **Client on `8080:80`, not `80:80`** — the TrueNAS web UI occupies port 80/443, so binding 80 fails. Any free port works.
- **No `ports:` on the server** — nginx in the client container proxies `/api` to `server:3001` over the internal network, so the API never needs host exposure.
- **Named volume for progress** — reading progress is stored as JSON files in the `progress_data` Docker volume. To keep them on a dataset instead (easier to back up), replace the volume line with a host path such as `/mnt/<pool>/apps/polka/progress:/data/progress` and drop the top-level `volumes:` block.

## 3. Verify

- Open `http://<nas-ip>:8080` — the Polka home screen should load.
- API smoke test: `curl http://<nas-ip>:8080/api/progress/test` should return `{"error":"not found"}` — the server answering through the nginx proxy.

## 4. Use it

- Add a book with **Browse files**, or configure SMB browsing under **Settings (⚙)** — use the NAS's real IP, port 445, and your share credentials, then **Test Connection** and **Save**.

## Updating

New images are published to Docker Hub automatically by CI whenever an app's version is bumped on `main`. To update, hit **Update** on the app in **Apps → Installed** (or stop/start it) to pull the new `:latest`.

## Known limitations

- **PWA install requires HTTPS.** Over plain `http://<nas-ip>:8080` the service worker will not register, so "Add to Home Screen" offline support is unavailable. Reading works fine. To fix, serve the app through HTTPS — e.g. a reverse proxy with a certificate, or Tailscale Serve if the NAS is on a tailnet.
