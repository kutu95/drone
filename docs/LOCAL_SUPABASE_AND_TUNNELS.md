# Local Supabase + public app URL: routing notes (for future projects)

Use this when Supabase runs on your LAN (e.g. Docker on `192.168.x.x`) but the web app is reachable from the internet (e.g. Cloudflare Tunnel).

## The problem

- Anything using **`NEXT_PUBLIC_SUPABASE_URL`** runs in the **browser** and calls that host directly.
- If that host is a **tunnel hostname** (e.g. `https://supabase.example.com`), traffic may **leave your network and come back** (hairpin), even though Postgres/API are “local.”
- That wastes bandwidth and adds latency.

## Options (keep for future apps)

### A — LAN URL in `NEXT_PUBLIC_SUPABASE_URL`

- Set the URL to your internal API base, e.g. `http://192.168.0.x:54321` (match your real Kong/API port).
- **Works when** every client browser can reach that IP (same LAN or VPN).
- **Fails when** users are on the open internet without VPN (browser cannot reach private IPs).

### B — Split URLs (partial)

- **Server-only** env: internal Supabase URL for API routes / SSR.
- **Client** keeps public tunnel URL.
- **Helps only** server-side Supabase usage; client-side `@supabase/supabase-js` still uses the tunnel unless you refactor.

### C — Backend-for-frontend (BFF) — best for **mixed** local + remote users

- Browser talks only to your **Next.js (or other) app** on a public URL.
- The **server** talks to Supabase on the **private** URL (or Docker network).
- **Pros:** No browser→tunnel→Supabase hairpin; one model for all users; can keep secrets on the server.
- **Cons:** Substantial refactor; **storage** uploads/downloads often need proxy or server-issued signed URLs; **Realtime** needs a deliberate pattern; **auth** must be designed server-first.

## Quick decision rule

| Who uses the app? | Practical approach |
|-------------------|-------------------|
| Always on LAN/VPN   | **A** — `NEXT_PUBLIC_SUPABASE_URL` = LAN API URL |
| Mixed LAN + internet | **C** — proxy data through your app server |
| Internet only, Supabase local | **C** (or VPN for users) |

## Things to double-check

- **CORS** on Supabase if the browser origin changes.
- **`NEXT_PUBLIC_*`** is embedded in the client bundle — never put service-role keys there.
- **HTTPS vs HTTP** on LAN (often HTTP locally is fine; tunnels use HTTPS).

## Related in this repo

- Migration / local Postgres notes: `docs/MIGRATE_SUPABASE_TO_LOCAL_POSTGRES.md`
- Exposing non-`public` schemas for PostgREST: `scripts/expose-drone-schema-local.sql`, `supabase/config.toml`

---

*Added so we “remember” this pattern for future self-hosted Supabase apps without redoing the architecture discussion.*
