# Hosting the Wordlight web studio (Docker + Caddy)

One way to host your own copy: the files in `dist/` served as static files by a small Caddy container behind an
existing Caddy edge proxy. Change the host name in `wordlight.caddy` to your own.

The container serves files only. It holds no credentials and no user data: saved shows stay in each visitor's
browser, and the companion API (songs, Bibles, OBS outputs, settings) only ever runs on the visitor's own computer.
Requests to `/api/*` get a plain 404.

## Files
- `docker-compose.yml`: container `wordlight-web`, Caddy image pinned by digest, read-only root, 64 MB memory, no
  ports published on the host, joins the existing external Docker network `web` shared with the edge proxy.
- `Caddyfile`: the container's config. Plain HTTP on :8080 (the edge does TLS), admin API off, root `/srv`, no
  directory listings, dotfiles hidden, `Cache-Control: no-cache`, JavaScript content type for `.js`/`.mjs`,
  `/api/*` returns 404.
- `wordlight.caddy`: the site block for the edge proxy, which imports `*.caddy` from its sites folder.

## Layout on the server
```
/opt/wordlight/
  docker-compose.yml
  Caddyfile
  current -> releases/c1e98ab
  releases/c1e98ab/dist/
/opt/proxy/sites/wordlight.caddy
```
`releases/c1e98ab/dist/` holds `dist/` from source commit c1e98ab86bf1032728740a8fdcd1dfc220fae5d3 plus
`wordlight-obs-companion.zip`. The studio's **Download companion** button links to that ZIP. The source tree does
not include it; take it from the GitHub release v1.0.0 and check it before copying it in:
```
sha256sum wordlight-obs-companion.zip
# Expected: 565b0a06a1cae14ddc232a0655ecf9e159b33827cfced3f9929d0b392ae35df4
```

## First start
1. Check the shared network exists: `docker network inspect web`. If your proxy uses another network name,
   change `networks.web` in `docker-compose.yml`.
2. In `/opt/wordlight`: `docker compose up -d`. Check `docker compose ps` shows it running and
   `docker port wordlight-web` shows nothing.
3. Copy `wordlight.caddy` to `/opt/proxy/sites/`. Validate the edge config, then reload it gracefully (no
   restart, so the other sites stay up):
   ```
   docker exec proxy-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   Use your proxy's own container name and config path.
4. Check: the site returns 200 over HTTPS; `/app.js` is `text/javascript`; `/api/state` and `/api/health` return
   404; the other sites behind the proxy still answer.

## Updating to a new release
1. Put the new `dist/` (with its companion ZIP) in `releases/<commit>/dist/`.
2. Point `current` at it: `ln -sfn releases/<commit> current`.
3. Recreate only this container: `docker compose up -d --force-recreate wordlight-web`. The mount is resolved when
   the container is created, so a plain restart keeps serving the old release. The edge proxy needs no change.

## Rollback
- To an earlier release: point `current` back and recreate `wordlight-web` as above.
- To remove the site: delete `/opt/proxy/sites/wordlight.caddy`, validate and reload the edge as above, then run
  `docker compose down` in `/opt/wordlight`. Nothing else on the server is changed.

## Pairing the companion with a hosted studio
The companion accepts screens only from sites listed in the `WORDLIGHT_BRIDGE_ORIGINS` environment variable, read
when it starts. Origins are comma-separated, each an exact `https://host` with no path or trailing slash.

A convenient place for it is `.wordlight-data/companion.env` beside the companion, loaded by starting it with Node's
env-file option:
```
node --env-file-if-exists=.wordlight-data/companion.env server.mjs --open
```
with this line in the file (keep any origins and other settings already there):
```
WORDLIGHT_BRIDGE_ORIGINS=https://wordlight.isaacjoresanya.com
```
or, next to an existing one, `WORDLIGHT_BRIDGE_ORIGINS=https://old.example.org,https://wordlight.isaacjoresanya.com`.
`Start Wordlight.cmd` loads this file itself. The portable package's **Start Wordlight** does not, so start that
companion with the command above (or set the variable in its environment another way).

Restart the companion, then on the hosted site open **OBS & screens** and enter the code shown in the local studio.
The browser may ask to allow access to devices on the local network; allow it.
