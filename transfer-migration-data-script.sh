#!/bin/bash
# Transfer the data migration script to server

echo "📤 Transferring migrate-data-via-api.ts to server..."

scp /Users/bowskill/Documents/Drone/scripts/migrate-data-via-api.ts john@192.168.0.146:~/apps/drone/scripts/

echo "✅ Transfer complete!"
echo ""
echo "Now on your server, run:"
echo "  cd ~/apps/drone"
echo "  export LOCAL_SUPABASE_URL=\"http://localhost:54321\""
echo "  export LOCAL_SUPABASE_SERVICE_KEY=\"sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz\""
echo "  npm run migrate:data"
