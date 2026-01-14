# Database Migration Quick Start

**TL;DR version** - Full guide: `contexts/DATABASE_MIGRATION_GUIDE.md`

## 🚀 Quick Migration (5 Steps)

### Step 1: Verify Local Supabase is Running

```bash
ssh <username>@192.168.0.146
supabase status
```

If not running, start it:
```bash
supabase start
```

### Step 2: Run Migrations

```bash
cd ~/apps/drone

# Option A: Using Supabase CLI
supabase db reset

# Option B: Run migrations manually
for migration in supabase/migrations/*.sql; do
    psql "postgresql://postgres:postgres@localhost:54322/postgres" < "$migration"
done
```

### Step 3: Migrate Data

**Option A: Use the automated script (easiest)**

```bash
cd ~/apps/drone
./migrate-database.sh
```

**Option B: Manual migration**

```bash
# Export from cloud (get connection string from Supabase Dashboard)
pg_dump "postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --no-owner --no-acl --format=custom --file=/tmp/backup.dump

# Import to local
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/backup.dump
```

### Step 4: Expose Through Cloudflare Tunnel

```bash
# Create DNS record
cloudflared tunnel route dns farm-cashbook supabase.landlife.au

# Update tunnel config (~/.cloudflared/config.yml)
# Add at top:
# - hostname: supabase.landlife.au
#   service: http://localhost:54321

# Restart tunnel
sudo systemctl restart cloudflared
```

### Step 5: Update Environment Variables

```bash
cd ~/apps/drone

# Get local Supabase keys
supabase status

# Update .env.production
nano .env.production

# Set:
NEXT_PUBLIC_SUPABASE_URL=https://supabase.landlife.au
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-key>

# Rebuild and restart
npm run build
pm2 restart drone
```

## 📋 Where to Find Connection Strings

**Cloud Supabase:**
- Dashboard → Settings → Database → Connection String → Session Mode
- Current project: `uiknuzhkrljfbvxjhsxr`

**Local Supabase:**
```
postgresql://postgres:postgres@localhost:54322/postgres
```

## ✅ Verification

```bash
# Check tables
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt"

# Check data
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM missions;"

# Check in Studio
# Open: http://192.168.0.146:54323/
```

## 🆘 Quick Troubleshooting

**Supabase not running?**
```bash
supabase status
supabase start
```

**Can't connect?**
- Check port: `54322` for DB, `54321` for API
- Verify Supabase is running

**Migration errors?**
- Use `--clean --if-exists` flags
- Some warnings about system tables are OK

**Connection string issues?**
- Use Session Pooler (IPv4 compatible)
- Check from Supabase Dashboard

## 📚 Full Guides

- **Complete Guide**: `contexts/DATABASE_MIGRATION_GUIDE.md`
- **Deployment Docs**: `/Users/bowskill/deployment-docs/DATABASE_MIGRATION_GUIDE.md`
- **Quick Reference**: `/Users/bowskill/deployment-docs/QUICK_DATABASE_MIGRATION.md`

---

**Need help?** See `contexts/DATABASE_MIGRATION_GUIDE.md` for detailed instructions.





