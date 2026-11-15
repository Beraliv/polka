# Installing Polka on TrueNAS SCALE

Polka runs as a two-container custom app on TrueNAS SCALE: the client (nginx serving the SPA and proxying `/api`) and the server (Node.js). Because the containers must share a network — nginx proxies to the hostname `server` — the app is installed with **Install via YAML**, not the single-container Custom App form wizard.

## Prerequisites

- TrueNAS SCALE **24.10 (Electric Eel) or newer** — these versions run apps on Docker and support compose YAML. See the [official custom app docs](https://apps.truenas.com/managing-apps/installing-custom-apps/).
- An apps pool configured (**Apps → Settings → Choose Pool**).
- A dataset (or directory) on a pool for the reading-progress files, e.g. `/mnt/<pool>/apps/polka/progress` (**Datasets → Add Dataset**).
- A second dataset (or directory) for the SMB configuration file, e.g. `/mnt/<pool>/apps/polka/smb`.

TrueNAS pulls the prebuilt images [`beraliv/polka-server`](https://hub.docker.com/r/beraliv/polka-server) and [`beraliv/polka-client`](https://hub.docker.com/r/beraliv/polka-client), published to Docker Hub by CI (`linux/amd64`); it does not build from source.

## 1. Install via YAML

1. In the TrueNAS UI, go to **Apps → Discover Apps**.
2. Open the **⋮** menu next to the **Custom App** button and choose **Install via YAML**.
3. Set **Name** to `polka` and paste the config below (replace `/mnt/<pool>/apps/polka/progress` and `/mnt/<pool>/apps/polka/smb` with your dataset paths):

```yaml
services:
  client:
    depends_on:
      - server
    image: beraliv/polka-client:latest
    ports:
      - '8080:80'
    pull_policy: always
    restart: unless-stopped
  server:
    environment:
      ANTHROPIC_API_KEY: ANTHROPIC_API_KEY
      HOST: 0.0.0.0
      PORT: '3001'
      PROGRESS_PATH: /data/progress
      SMB_CONFIG_ENCRYPTION_KEY: SMB_CONFIG_ENCRYPTION_KEY
      SMB_CONFIG_PATH: /data/smb
    image: beraliv/polka-server:latest
    pull_policy: always
    restart: unless-stopped
    volumes:
      - /mnt/<pool>/apps/polka/progress:/data/progress
      - /mnt/<pool>/apps/polka/smb:/data/smb
```

4. Click **Save**. TrueNAS pulls the images and starts both containers; the app appears as **Running** under **Apps → Installed**.

Client is on `8080:80` rather than `80:80` because the TrueNAS web UI itself occupies port 80/443 — any free port works, and it happens to match the repo's `docker-compose.yml` default (`CLIENT_PORT`) too.

Other differences from the repo's `docker-compose.yml`, and why:

- **No `ports:` on the server** — nginx in the client container proxies `/api` to `server:3001` over the internal network, so the API never needs host exposure.
- **Host path for progress, not a named volume** — reading progress is stored as JSON files, and mounting a dataset path keeps them visible on the pool, easy to back up (snapshots/replication), and safe across app reinstalls. A named Docker volume (what `docker-compose.yml` uses) would hide them inside Docker's storage and tie them to the app's lifecycle.
- **Same reasoning for the SMB config dataset** — the server persists your NAS connection settings to a JSON file at `SMB_CONFIG_PATH`, the same way it persists progress. This keeps your NAS password off the client (browser `localStorage`) entirely. The password itself is AES-256-GCM encrypted before it's written; see [**Encrypting the SMB password**](#encrypting-the-smb-password) below.

## Encrypting the SMB password

By default the server encrypts the SMB password with a key it generates on first use and stores as a `key` file next to `config.json` in the SMB config dataset — the password is never written in raw form, but anyone with read access to that dataset can read the key file too.

For real protection, supply your own key via the `SMB_CONFIG_ENCRYPTION_KEY` environment variable, kept outside the dataset (e.g. pasted only into the app's YAML config, not stored on the pool). Generate one with `openssl rand -hex 32` and add it to the `environment:` block:

```yaml
services:
  server:
    environment:
      SMB_CONFIG_ENCRYPTION_KEY: '<paste the generated value here>'
```

Set it once, before saving your NAS credentials in Settings — changing it later makes any previously saved config undecryptable, and you'll need to re-enter your NAS credentials.

## 2. Verify

- Open `http://<nas-ip>:8080` — the Polka home screen should load.
- API smoke test: `curl http://<nas-ip>:8080/api/progress/test` should return `{"error":"not found"}` — the server answering through the nginx proxy.

## 3. Use it

- Add a book with **Browse files**, or configure SMB browsing under **Settings (⚙)** — use the NAS's real IP, port 445, and your share credentials, then **Test Connection** and **Save**.

## App icon

TrueNAS shows a generic cube icon for custom apps. To use the Polka icon, add an `icon` line to the app's metadata file from the TrueNAS shell:

```bash
sudo nano /mnt/.ix-apps/app_configs/polka/metadata.yaml
```

Add this line inside the `metadata:` block (aligned with the other keys, e.g. right after `host_mounts: []`):

```yaml
  "icon": "https://raw.githubusercontent.com/Beraliv/polka/refs/heads/main/apps/client/public/icon.svg"
```

To save a file you're editing, press "Ctrl + O" and then "Enter". When you're finished, exit the file by pressing "Ctrl + X".

Then in the UI open **Apps → Installed → polka → Edit** (on the Application Info widget) and click **Save** without changing anything — this reloads the metadata and the icon appears.

## Updating

New images are published to Docker Hub automatically by CI whenever an app's version is bumped on `main`. The config uses the `:latest` tag with `pull_policy: always`, so restarting the app pulls the newer `:latest` images instead of reusing the copies cached on the NAS. Check the new version in Polka's **Settings (⚙)** footer.

The Update dialog always shows **1.0.0 / custom** with no versions to pick — that is expected for YAML custom apps, which have no catalog behind them, and it does not reflect Polka's real version. To see which version is actually running, open Polka's **Settings (⚙)** page — the footer shows the client and server versions — or run `curl http://<nas-ip>:8080/api/version`.

## Debugging

Logs, version checks, API smoke tests, and common failures are covered in [truenas-debugging.md](./truenas-debugging.md).

## Enabling HTTPS

Browsers only register the service worker (and so offer "Add to Home Screen" offline support) on HTTPS. [Tailscale Services](https://tailscale.com/docs/features/tailscale-services) can serve the app over HTTPS on your tailnet with a trusted certificate that Tailscale obtains from Let's Encrypt and renews automatically before it expires, so no cron job or manual certificate import is needed. Nothing is exposed to the public internet: the address works only for devices on your tailnet.

Each Tailscale Service gets its own name (`<name>.<tailnet>.ts.net`) and its own Tailscale IP, so Polka can use port 443 even though TrueNAS's web UI already occupies it.

Prerequisites:

- The `tailscale` TrueNAS app (community train) is installed and running with host networking. Run the commands below from **Apps → tailscale → Shell**.
- HTTPS certificates and MagicDNS are enabled for your tailnet in the Tailscale admin console.
- The TrueNAS host is tagged `tag:nas`, which Tailscale Services requires.

Steps:

1. **Define the service.** In the Tailscale admin console, open **Services → Add service**. Name it `polka`, set the port to `tcp:443`, and add no tags.
2. **Advertise it from the NAS.** In the `tailscale` app shell, point the service at the client container's host port:

   ```
   tailscale serve --service=svc:polka --https=443 http://127.0.0.1:8080
   ```

3. **Approve the host.** Back in the admin console, open the `polka` service and click **Approve…** next to the NAS. Its status should change to **Online**.
4. **Verify from a device on your tailnet:**

   ```
   curl -sS https://polka.<tailnet>.ts.net/ -o /dev/null -w "%{http_code} verify=%{ssl_verify_result}\n"
   ```

   `verify=0` means the certificate is trusted. Then open `https://polka.<tailnet>.ts.net` in the browser and use **Add to Home Screen**.

Useful commands on the NAS:

```
# List what is being served
tailscale serve status

# Stop serving a service on this host
tailscale serve clear svc:polka
```

To remove the service completely, clear it on the host, then delete it under **Services** in the admin console.

Notes:

- Serve configuration is stored in `/var/lib/tailscale`, which should be on a persistent dataset, so it survives app restarts. After a reboot, run `tailscale serve status` to confirm the service came back.
- Plain HTTP stays available at `http://<nas-ip>:8080` as a fallback. Browser storage is per address, so reading progress and offline data saved over HTTP do not appear on the HTTPS address.
- Polka calls its API with relative paths (`/api/...`), so it needs no configuration change for HTTPS.
- If Chrome still shows "Not secure" with a valid certificate, it may have cached a warning bypass for the whole hostname from an earlier self-signed certificate warning. Fully quit and reopen Chrome, or clear the site's data at `chrome://settings/content/all`.
- Tailscale access depends on the `tailscale` app running. Away from home with the app down, there is no access to the NAS until it is back on the network.

## Known limitations

- **PWA install requires HTTPS.** Over plain `http://<nas-ip>:8080` the service worker will not register, so "Add to Home Screen" offline support is unavailable. Reading works fine. To fix, serve the app over HTTPS — see [Enabling HTTPS](#enabling-https)
