#!/bin/bash
# Quick script to transfer migration script to server

echo "📤 Transferring migrate-database.sh to server..."

scp /Users/bowskill/Documents/Drone/migrate-database.sh john@192.168.0.146:~/apps/drone/

echo "✅ Transfer complete!"
echo ""
echo "Now on your server, run:"
echo "  cd ~/apps/drone"
echo "  chmod +x migrate-database.sh"
echo "  ./migrate-database.sh"





