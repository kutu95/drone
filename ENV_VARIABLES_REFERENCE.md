# Environment Variables Reference - Drone App

Copy these to your `.env.production` file on the server.

## Required Variables

```bash
# Next.js Configuration
NEXT_PUBLIC_BASE_PATH=
USE_DOMAIN=true

# Supabase Configuration
# IMPORTANT: Use HTTPS URL if Supabase is exposed through Cloudflare Tunnel
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
# Or if using local Supabase through tunnel:
# NEXT_PUBLIC_SUPABASE_URL=https://supabase.landlife.au

NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# Google Maps API Key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
```

## Optional Variables

```bash
# Service role key for server-side operations (scripts, admin functions)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# DJI Log Parser Configuration (for flight log parsing)
DJI_API_KEY=your-dji-api-key-here
DJI_LOG_PARSER_PATH=/path/to/dji-log-parser

# DCRAW Configuration (for DNG file processing/thumbnails)
DCRAW_PATH=/usr/bin/dcraw

# Photoprism Configuration (for DNG file uploads)
PHOTOPRISM_URL=http://your-photoprism-instance:2342
PHOTOPRISM_ACCESS_TOKEN=your-photoprism-access-token
```

## Notes

- **Supabase URL**: If you're using a local Supabase instance exposed through Cloudflare Tunnel, use the HTTPS tunnel URL (e.g., `https://supabase.landlife.au`)
- **DJI API Key**: Required for parsing flight log files version 13+. See `docs/getting-dji-api-key.md` for setup instructions.
- **DJI Log Parser Path**: Only needed if you want to use the CLI parser for accurate GPS coordinates. Binary must match server architecture (Linux x86_64).
- **DCRAW Path**: Only needed for DNG file processing. Usually at `/usr/bin/dcraw` on Linux systems.
- **Photoprism URL**: URL of your Photoprism instance (e.g., `http://localhost:2342` or `https://photoprism.example.com`). If not configured, DNG files will still be processed for thumbnails but won't be uploaded to Photoprism.
- **Photoprism Access Token**: Access token for Photoprism API authentication. Generate using `photoprism auth add -n "DroneApp" -s "files folders"` or through the Photoprism web interface (Settings > Account > Apps and Devices).

## Getting Values

- **Supabase Keys**: Available in your Supabase project dashboard under Settings > API
- **Google Maps API Key**: Create in Google Cloud Console, enable Maps JavaScript API
- **DJI API Key**: See `docs/getting-dji-api-key.md` for instructions

