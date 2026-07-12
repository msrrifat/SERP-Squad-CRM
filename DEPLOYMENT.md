# Deploying the CRM to app.serpsquad.com

The CRM is two processes behind ONE domain:

| Piece | What it is | Serves |
|---|---|---|
| Frontend | static files from `npm run build` (the `dist/` folder) | the app UI |
| API server | `node server/index.js` on `127.0.0.1:8787` | `/api/*`, `/px.js` (the pixel), 2FA, WordPress/Webflow/ads proxies |

Everything origin-dependent in the code already resolves to the domain it is
served from — hosting at `https://app.serpsquad.com` makes the pixel snippet,
2FA calls and API calls correct automatically.

## 1. DNS

Add a record for the subdomain at your DNS host (where serpsquad.com is managed):

```
A     app   →  <your VPS IP>          (or CNAME app → your-app.onrender.com etc.)
```

> HostMaria shared hosting can serve the static frontend, but the API server
> is a persistent Node process — use a VPS (Hetzner/DigitalOcean), Render or
> Railway for it. Simplest: one small VPS runs both.

## 2. Build & run

```bash
npm ci
npm run build                 # → dist/
APP_ORIGINS=https://app.serpsquad.com node server/index.js   # or via pm2/systemd
```

Keep it alive with pm2: `pm2 start server/index.js --name serpsquad-api` (then `pm2 save && pm2 startup`).

### Environment variables (server)

| Var | Purpose |
|---|---|
| `APP_ORIGINS` | CORS allowlist — set `https://app.serpsquad.com` (localhost defaults stay for dev) |
| `HOST` | bind address — leave unset (127.0.0.1) behind a reverse proxy |
| `SMTP_HOST/PORT/USER/PASS/FROM` | real 2FA verification emails (without SMTP, login shows labeled demo codes) |
| `DFS_LOGIN/DFS_PASSWORD` | DataForSEO fallback creds (UI-entered creds also work) |

## 3. Reverse proxy (pick one)

### Caddy — 2 lines, automatic HTTPS (recommended)

`Caddyfile` (included in this repo):

```
app.serpsquad.com {
    encode gzip
    handle /api/* { reverse_proxy 127.0.0.1:8787 }
    handle /px.js { reverse_proxy 127.0.0.1:8787 }
    handle { root * /var/www/serpsquad/dist  try_files {path} /index.html  file_server }
}
```

### nginx (`deploy/nginx.conf` in this repo)

Same routing: `/api/` + `/px.js` → `127.0.0.1:8787`, everything else → `dist/`
with an SPA fallback to `index.html`. Use certbot for the certificate.

## 4. What starts working once hosted

- **The pixel**: snippets read `https://app.serpsquad.com/px.js` automatically;
  client sites anywhere on the internet can call home, so "Verify installation"
  reflects real hits.
- **2FA emails**: with SMTP env vars set, verification codes are actually sent.
- **WordPress / Webflow / ads API calls**: unchanged — they were already
  server-side; they simply run from the VPS now.
- **Client portal & share links**: `https://app.serpsquad.com/#login`, `#share=…`.

## 5. Production checklist (from SECURITY notes)

- [ ] HTTPS only (Caddy automatic / certbot)
- [ ] `APP_ORIGINS` set to the real origin
- [ ] SMTP configured so 2FA sends real codes (demo codes are for local dev)
- [ ] Real user store + hashed passwords before real client onboarding —
      the in-app accounts are still the prototype's in-memory state
- [ ] `server/data/` and `server/auth/` are on persistent disk and excluded
      from any public web root
- [ ] Keep the API bound to 127.0.0.1 — only the reverse proxy is public
