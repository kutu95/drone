#!/bin/bash
# Fully automated build-and-fix loop via SSH
# This script will pull, build, extract errors, and wait for fixes

set -e

SERVER_USER="john"
SERVER_HOST="192.168.0.146"
SERVER_PATH="~/apps/drone"
SSH_CMD="ssh ${SERVER_USER}@${SERVER_HOST}"

MAX_ITERATIONS=20
ITERATION=0

echo "🚀 Starting automated build-and-fix loop"
echo "========================================"
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "🔄 Iteration $ITERATION/$MAX_ITERATIONS"
    echo "----------------------------------------"
    
    # Pull latest
    echo "📥 Pulling latest changes..."
    $SSH_CMD "cd ${SERVER_PATH} && git pull origin main" || {
        echo "❌ Failed to pull. Check git status."
        exit 1
    }
    
    # Build
    echo "🔨 Building..."
    BUILD_OUTPUT=$($SSH_CMD "cd ${SERVER_PATH} && npm run build 2>&1" || true)
    
    # Check for success
    if echo "$BUILD_OUTPUT" | grep -q "Compiled successfully" && ! echo "$BUILD_OUTPUT" | grep -q "Failed to compile"; then
        echo ""
        echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
        echo ""
        echo "$BUILD_OUTPUT" | tail -10
        exit 0
    fi
    
    # Extract error
    ERROR_LINE=$(echo "$BUILD_OUTPUT" | grep -E "Type error:|Failed to compile" -A 3 | head -10)
    ERROR_FILE=$(echo "$BUILD_OUTPUT" | grep -oE "\./src/[^:]+" | head -1)
    ERROR_LOC=$(echo "$BUILD_OUTPUT" | grep -oE ":[0-9]+:[0-9]+" | head -1)
    
    if [ -z "$ERROR_FILE" ]; then
        echo ""
        echo "⚠️  Could not parse error. Full output:"
        echo "$BUILD_OUTPUT" | tail -30
        echo ""
        echo "📝 Please share the error above for manual fixing."
        exit 1
    fi
    
    echo ""
    echo "❌ Build failed:"
    echo "   File: $ERROR_FILE$ERROR_LOC"
    echo "   Error:"
    echo "$ERROR_LINE" | sed 's/^/   /'
    echo ""
    echo "⏳ Waiting for fix to be pushed to git..."
    echo "   (The assistant will fix this error and push it)"
    echo ""
    echo "Press Enter when the fix has been pushed, or Ctrl+C to stop..."
    read
    
done

echo ""
echo "❌ Reached maximum iterations ($MAX_ITERATIONS)."
echo "Please check for remaining errors manually."
