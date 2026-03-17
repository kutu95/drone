# Troubleshooting: 404 on Supabase REST API (missions, flight_logs)

If the app shows **Failed to load missions** or **Failed to load flight logs** and the browser console has:

- `supabase.landlife.au/rest/v1/missions?... 404`
- `supabase.landlife.au/rest/v1/flight_logs?... 404`

the Supabase REST API is returning 404. Use this checklist.

## 1. Schema must match your database

The app sends a **schema** in the request (via `Accept-Profile`). If that schema does not exist or does not contain `missions` / `flight_logs`, PostgREST returns 404.

**On the server**, in `~/apps/drone/.env.production`:

- If your tables are in the **`public`** schema (typical for Supabase):
  - Set `NEXT_PUBLIC_SUPABASE_SCHEMA=public`, or
  - Omit it (the app defaults to `public`).
- If your tables are in a **custom schema** (e.g. `drone`):
  - Set `NEXT_PUBLIC_SUPABASE_SCHEMA=drone`.

Then rebuild and restart:

```bash
cd ~/apps/drone
npm run build
pm2 restart ecosystem.config.js
```

## 2. Supabase must be running and reachable

If the Cloudflare Tunnel sends `supabase.landlife.au` to a host that runs Supabase:

- On that host, confirm the Supabase API is up, e.g.:
  - `supabase status` (if using Supabase CLI), or
  - Check that the process listening on port **54321** (Kong/API) is running.
- From the same host, test:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/
  ```
  You want a **200** (or 301/302), not 404.

## 3. Tunnel must target the Supabase API port

In your Cloudflare Tunnel config (e.g. `config.yml`):

```yaml
ingress:
  - hostname: supabase.landlife.au
    service: http://localhost:54321
  # ... other hostnames ...
```

- If the tunnel runs on the **same machine** as Supabase, `localhost:54321` is correct.
- If the tunnel runs on a **different machine**, use that machine’s hostname or IP and port (e.g. `http://192.168.0.146:54321`).

Restart the tunnel after changes:

```bash
sudo systemctl restart cloudflared
```

## 4. Test the API directly

From your laptop or the server:

```bash
# Replace YOUR_ANON_KEY with your real anon key from Supabase (Settings → API)
curl -i "https://supabase.landlife.au/rest/v1/" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

- **200** or **301**: API is reachable; then check schema and table names.
- **404**: Tunnel or Supabase routing problem (steps 2 and 3).
- **Connection refused / timeout**: Tunnel or firewall (step 3, or firewall rules).

To test a table (e.g. `missions`) in the `public` schema:

```bash
curl -i "https://supabase.landlife.au/rest/v1/missions?select=id&limit=1" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Accept-Profile: public"
```

- **200**: Table exists in `public`; app should use `NEXT_PUBLIC_SUPABASE_SCHEMA=public` (or unset).
- **404**: Table or schema wrong; fix schema in `.env.production` or create the table in the schema you use.

## 5. Quick fix to try first

On the **server**, ensure production uses the `public` schema and rebuild:

```bash
cd ~/apps/drone
echo 'NEXT_PUBLIC_SUPABASE_SCHEMA=public' >> .env.production
npm run build
pm2 restart ecosystem.config.js
```

If your tables are in `public`, this often resolves the 404.
