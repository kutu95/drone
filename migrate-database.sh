#!/bin/bash
# Database Migration Script for Drone App
# Migrates database from cloud Supabase to local server Supabase

set -e

echo "🗄️  Database Migration - Cloud to Local Supabase"
echo "=================================================="
echo ""

# Check if pg_dump and pg_restore are available
if ! command -v pg_dump &> /dev/null; then
    echo "❌ Error: pg_dump not found"
    echo "Install PostgreSQL client tools:"
    echo "  sudo apt-get install -y postgresql-client"
    exit 1
fi

if ! command -v pg_restore &> /dev/null; then
    echo "❌ Error: pg_restore not found"
    echo "Install PostgreSQL client tools:"
    echo "  sudo apt-get install -y postgresql-client"
    exit 1
fi

# Get cloud connection string
echo "📥 Step 1: Get Cloud Connection String"
echo "--------------------------------------"
echo ""
echo "Please provide your Supabase Cloud connection string."
echo "Find it in: Supabase Dashboard → Settings → Database → Connection String → Session Mode"
echo ""
echo "Format: postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
echo ""
read -p "Cloud connection string: " CLOUD_CONN

if [ -z "$CLOUD_CONN" ]; then
    echo "❌ Error: Connection string cannot be empty"
    exit 1
fi

# Test cloud connection
echo ""
echo "🔍 Testing cloud connection..."
if ! pg_isready -d "$CLOUD_CONN" &> /dev/null; then
    echo "⚠️  Warning: Could not verify connection (this is OK, continuing anyway)"
fi

# Local connection string
LOCAL_CONN="postgresql://postgres:postgres@localhost:54322/postgres"

# Test local connection
echo "🔍 Testing local Supabase connection..."
if ! pg_isready -d "$LOCAL_CONN" &> /dev/null; then
    echo "❌ Error: Cannot connect to local Supabase"
    echo ""
    echo "Please ensure:"
    echo "1. Supabase is running: supabase status"
    echo "2. Database port is 54322"
    echo "3. Default credentials are postgres:postgres"
    exit 1
fi

echo "✅ Local Supabase connection OK"
echo ""

# Ask about migration type
echo "📋 Step 2: Choose Migration Type"
echo "---------------------------------"
echo ""
echo "1. Full migration (schema + data) - Recommended for first time"
echo "2. Data only (schema already exists)"
echo ""
read -p "Choose option (1 or 2): " MIGRATION_TYPE

BACKUP_FILE="/tmp/drone_cloud_backup_$(date +%Y%m%d_%H%M%S).dump"

if [ "$MIGRATION_TYPE" = "1" ]; then
    echo ""
    echo "📤 Step 3: Exporting full database from cloud..."
    echo "-----------------------------------------------"
    pg_dump "$CLOUD_CONN" \
        --no-owner --no-acl \
        --format=custom \
        --file="$BACKUP_FILE"
    
    echo "✅ Export complete: $BACKUP_FILE"
    echo ""
    echo "📥 Step 4: Importing to local Supabase..."
    echo "----------------------------------------"
    pg_restore \
        --clean --if-exists \
        --no-owner --no-acl \
        --dbname="$LOCAL_CONN" \
        "$BACKUP_FILE"
    
elif [ "$MIGRATION_TYPE" = "2" ]; then
    echo ""
    echo "📤 Step 3: Exporting data only from cloud..."
    echo "--------------------------------------------"
    pg_dump "$CLOUD_CONN" \
        --data-only \
        --no-owner --no-acl \
        --format=custom \
        --file="$BACKUP_FILE"
    
    echo "✅ Export complete: $BACKUP_FILE"
    echo ""
    echo "📥 Step 4: Importing data to local Supabase..."
    echo "----------------------------------------------"
    pg_restore \
        --data-only \
        --clean --if-exists \
        --no-owner --no-acl \
        --dbname="$LOCAL_CONN" \
        "$BACKUP_FILE"
else
    echo "❌ Invalid option"
    exit 1
fi

echo ""
echo "✅ Migration complete!"
echo ""

# Verify
echo "🔍 Step 5: Verifying migration..."
echo "----------------------------------"

# Check tables
echo ""
echo "Tables in local database:"
psql "$LOCAL_CONN" -c "\dt" | head -20

echo ""
echo "📊 Checking row counts for key tables..."

# Check missions
MISSIONS_COUNT=$(psql "$LOCAL_CONN" -t -c "SELECT COUNT(*) FROM missions;" 2>/dev/null | xargs || echo "0")
echo "  Missions: $MISSIONS_COUNT"

# Check flight_logs (if table exists)
FLIGHT_LOGS_COUNT=$(psql "$LOCAL_CONN" -t -c "SELECT COUNT(*) FROM flight_logs;" 2>/dev/null | xargs || echo "0")
echo "  Flight Logs: $FLIGHT_LOGS_COUNT"

echo ""
echo "✅ Verification complete!"
echo ""

# Next steps
echo "📝 Next Steps:"
echo "--------------"
echo ""
echo "1. Verify data in Supabase Studio: http://192.168.0.146:54323/"
echo "2. Update .env.production with local Supabase URL and keys"
echo "3. Get local Supabase keys: supabase status"
echo "4. Rebuild and restart app:"
echo "   cd ~/apps/drone"
echo "   npm run build"
echo "   pm2 restart drone"
echo ""
echo "See contexts/DATABASE_MIGRATION_GUIDE.md for detailed next steps."
echo ""





