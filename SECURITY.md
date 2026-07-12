# Security model — SERP Squad CRM

What is protected today, how, and what a production deployment must add.

## Implemented protections

### API server (server/index.js)
| Protection | Detail |
|---|---|
| **Network exposure** | Binds `127.0.0.1` by default — the API is unreachable from other machines unless `HOST` is set explicitly (do that only behind a reverse proxy with TLS). |
| **CORS allowlist** | Browser cross-origin calls are only honored from `APP_ORIGINS` (default: the Vite dev origin). Everything else gets no `Access-Control-Allow-Origin`. |
| **Security headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, restrictive `Permissions-Policy` on every response. |
| **Rate limiting** | Per-IP sliding window: 240 requests/min globally, 20 requests/10 min on `/api/auth/*` (blunts credential-stuffing and code brute force). |
| **Payload caps** | 2 MB request bodies; 8 MB share payloads. |
| **No secret echo** | Credentials are accepted per-request or from env/`credentials.json`; they are never returned in responses. |
| **Share links** | 128-bit `randomBytes` ids — not guessable. |
| **Fixed upstream hosts** | Every outbound fetch targets a hard-coded provider host (DataForSEO, Google, Meta, TikTok…); user input never chooses the host (no SSRF surface). |

### Two-factor authentication (new device / browser / cleared storage)
- Sign-in (`#login`, team and clients) checks a **trusted-device token** with the server. No valid token → a **6-digit email verification code** is required.
- Codes are stored **hashed (SHA-256)**, expire after **10 minutes**, allow **5 attempts**, and are **single-use**. Requesting a new code invalidates the previous one.
- On success the browser receives a random **256-bit device token**; the server stores only its **hash** (`server/data/auth/devices.json`) with a **90-day** lifetime and a 10-device cap per account. Clearing browser data or switching browsers forces a fresh code.
- Codes are emailed via **real SMTP over TLS** when configured (Company Settings → API settings → *Email SMTP*; any TLS provider). Without SMTP the server returns the code **clearly labeled DEMO** for local testing — never silently.
- The login **fails closed**: if the security server is unreachable, nobody signs in.

### Frontend
- All user content rendering goes through escaping helpers (`escHtml`, sanitized link rendering); published HTML is built by serializers, not string concatenation.
- API keys live in memory (React state) — never in `localStorage`. The only persisted browser value is the (useless-without-the-server) device-trust token.
- Identity walls: clients never see team names/photos (role labels + brand avatar), team members never see client identity (owner excepted); per-role and per-project section grants are enforced centrally in `App.jsx`.

## Production checklist (before real client data)
1. **Real authentication server-side** — the demo checks passwords in the frontend against in-memory state. Production needs server-side sessions: store only **bcrypt/argon2 hashes**, issue **httpOnly, Secure, SameSite cookies**, verify permissions on the server for every request.
2. **HTTPS everywhere** — terminate TLS at a reverse proxy (Caddy/Nginx); add **HSTS**; set `APP_ORIGINS` to the real app origin.
3. **Encrypt credentials at rest** — provider tokens (DataForSEO, ads platforms, SMTP) belong in a secrets manager or encrypted DB column, per-tenant.
4. **A real database with row-level tenancy** — React state offers no isolation once multiple users share a deployment.
5. **CSP** — add a strict `Content-Security-Policy` when serving the built frontend.
6. **Dependency & platform hygiene** — `npm audit` in CI, Node LTS updates, and log/alert on repeated 429s from the auth limiter.
