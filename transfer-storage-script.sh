#!/bin/bash
# Quick script to transfer storage buckets setup script to server

echo "📤 Transferring setup-storage-buckets.sh to server..."

scp /Users/bowskill/Documents/Drone/setup-storage-buckets.sh john@192.168.0.146:~/apps/drone/

echo "✅ Transfer complete!"
echo ""
echo "Now on your server, run:"
echo "  cd ~/apps/drone"
echo "  chmod +x setup-storage-buckets.sh"
echo "  ./setup-storage-buckets.sh"
