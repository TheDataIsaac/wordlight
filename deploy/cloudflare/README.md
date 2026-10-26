# Hosting the Wordlight web studio (Cloudflare Workers)

This is how https://wordlight.isaacjoresanya.com is hosted: the files in `dist/` uploaded as static assets of a
Cloudflare Worker named `wordlight`. There is no Worker script, so Cloudflare only serves files. Like the Docker +
Caddy option in `deploy/hetzner`, it holds no credentials and no user data.

## Files
- `wrangler.jsonc`: the Worker name, the assets folder (`public/`, built below) and the custom domain. Change the
  name and domain for your own copy.
- `_headers`: `Cache-Control: no-cache` and `X-Content-Type-Options: nosniff` on every file, matching the Caddy setup.

## Deploy
1. Build `public/` next to this file (it is ignored by git):
   ```
   rm -rf deploy/cloudflare/public && mkdir deploy/cloudflare/public
   cp dist/* deploy/cloudflare/_headers deploy/cloudflare/public/
   ```
2. Add `wordlight-obs-companion.zip` from the GitHub release to `public/`, so the studio's **Download companion**
   button works. Check it against the release's `SHA256SUMS.txt` first. For v1.0.0 the SHA-256 is
   `565b0a06a1cae14ddc232a0655ecf9e159b33827cfced3f9929d0b392ae35df4`.
3. From `deploy/cloudflare`, run `npx wrangler deploy` (after `npx wrangler login` with the Cloudflare account that
   holds the domain).
4. Open the site, look up a verse, and check that **Download companion** downloads the ZIP.

## Pairing with the local companion
The hosted studio sends screens to the companion on the operator's computer only if the companion allows its origin.
Add it to `.wordlight-data\companion.env` (keep any origins already there), then restart Wordlight:
```
WORDLIGHT_BRIDGE_ORIGINS=https://wordlight.isaacjoresanya.com
```
Shows and pairing are saved per site address in the browser, so a new address starts with an empty library.
