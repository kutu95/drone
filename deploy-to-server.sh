#!/bin/bash
# Deployment Script - Transfer Drone app to server

set -e  # Exit on error

SERVER="192.168.0.146"
APP_NAME="drone"
APP_DIR="~/apps/$APP_NAME"
USER="${1:-john}"  # Allow username as first argument, default to 'john'

echo "🚀 Deploying Drone App to Server"
echo "================================="
echo ""
echo "Server: $USER@$SERVER"
echo "App Directory: $APP_DIR"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ Error: .env.local file not found!"
    echo "Please create it first with your environment variables."
    exit 1
fi

echo "📦 Preparing files for transfer..."
echo ""

# Create a temporary directory for transfer
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Copy files (excluding node_modules, .next, .git, env files)
echo "Copying files..."
rsync -avz \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '.env*' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'dji-log-parser' \
    ./ "$TEMP_DIR/$APP_NAME/"

echo ""
echo "✅ Files prepared"
echo ""

# Transfer to server
echo "📤 Transferring files to server..."
echo "You may be prompted for SSH password..."
echo ""

rsync -avz \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '.env*' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'dji-log-parser' \
    ./ "$USER@$SERVER:$APP_DIR/"

echo ""
echo "✅ Files transferred successfully!"
echo ""
echo "📝 Next Steps:"
echo "1. SSH into the server:"
echo "   ssh $USER@$SERVER"
echo ""
echo "2. Navigate to app directory:"
echo "   cd $APP_DIR"
echo ""
echo "3. Create .env.production file with your environment variables"
echo "   (See ENV_VARIABLES_REFERENCE.md for template)"
echo ""
echo "4. Install dependencies and build:"
echo "   npm install"
echo "   npm run build"
echo ""
echo "5. Start with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "6. Setup domain (see DEPLOYMENT_GUIDE.md for details)"
echo ""
echo "📚 See DEPLOYMENT_GUIDE.md for complete instructions"

