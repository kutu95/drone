#!/bin/bash
# Server-side deployment script
# This script should be placed in ~/apps/drone/ on the server
# It pulls latest changes from GitHub and rebuilds/restarts the app

set -e  # Exit on error

APP_NAME="drone"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🚀 Starting deployment for $APP_NAME"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log "❌ Error: package.json not found. Are you in the app directory?"
    exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
    log "❌ Error: Not a git repository. Clone from GitHub first."
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
log "📍 Current branch: $CURRENT_BRANCH"

# Stash any local changes
log "📦 Stashing any local changes..."
git stash || true

# Pull latest changes
log "⬇️  Pulling latest changes from GitHub..."
if git pull origin "$CURRENT_BRANCH"; then
    log "✅ Successfully pulled latest changes"
else
    log "❌ Error: Failed to pull changes"
    exit 1
fi

# Check if package.json changed (might need new dependencies)
log "📦 Checking for dependency updates..."
npm install

# Build the app
log "🔨 Building application..."
if npm run build; then
    log "✅ Build successful"
else
    log "❌ Error: Build failed"
    exit 1
fi

# Restart with PM2
log "🔄 Restarting application with PM2..."
if pm2 restart "$APP_NAME"; then
    log "✅ Application restarted successfully"
else
    log "⚠️  PM2 restart failed, trying to start instead..."
    pm2 start ecosystem.config.js || pm2 save
fi

# Save PM2 configuration
pm2 save

log "✅ Deployment complete!"
log "Check status with: pm2 status"
log "View logs with: pm2 logs $APP_NAME"

