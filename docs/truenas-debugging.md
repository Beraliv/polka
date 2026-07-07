# Debugging Polka on TrueNAS SCALE

Commands below run in the TrueNAS shell (**System → Shell**, or SSH). TrueNAS names the containers `ix-polka-<service>-…`, so find them with:

```bash
sudo docker ps --filter name=polka
```

## Viewing logs

In the UI: **Apps → Installed → polka → Workloads → ⋮ → Logs** per container. From the shell:

```bash
sudo docker logs -f ix-polka-server-1   # Fastify server (API, SMB, progress)
sudo docker logs -f ix-polka-client-1   # nginx (access + error log)
```

On startup the server logs `Server listening on http://0.0.0.0:3001` — if that line is missing, the server never came up and the client will answer `502` on every `/api` request.

## Checking which version is running

The app pulls `:latest`, so the tag alone doesn't say which build is live. Compare digests:

```bash
sudo docker images --digests | grep polka
```

Match the digest against the tags on Docker Hub (each published version is also tagged with its `package.json` version, e.g. `polka-client:0.0.2`). If the digest is stale, hit **Update** on the app (or stop/start it) to re-pull.

## Testing the API path

The client's nginx proxies `/api` to `server:3001` over the internal network; the server has no host port. Test each hop:

```bash
# Through nginx (what the browser uses) — expect {"error":"not found"}
curl http://<nas-ip>:8080/api/progress/test

# From inside the client container, straight to the server
sudo docker exec ix-polka-client-1 curl -s http://server:3001/api/progress/test
```

If the second command works but the first doesn't, the problem is nginx config or the host port mapping. If both fail, read the server logs.

## Inspecting reading progress data

Progress is stored as one JSON file per book on the dataset mounted into the server container at `/data/progress` (see the volume line in the app YAML for the host path), so it can be read straight from the pool:

```bash
ls /mnt/<pool>/apps/polka/progress
cat /mnt/<pool>/apps/polka/progress/<bookId>.json
```

## Common failures

- **Update pulled nothing** — TrueNAS already had the current `:latest`. Verify a new image was actually published (repo **Actions** tab on GitHub, then Docker Hub tags) before blaming the pull.
- **SMB browsing fails** — the server container reaches the share over the network, so use the NAS's real IP (not `localhost`) in the app's SMB settings; check the server logs for the underlying error.
