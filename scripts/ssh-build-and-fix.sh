#!/bin/bash
# SSH automation script to build and fix errors on remote server
# Usage: ./scripts/ssh-build-and-fix.sh

set -e

# Server configuration
SERVER_USER="john"
SERVER_HOST="192.168.0.146"
SERVER_PATH="~/apps/drone"
SSH_CMD="ssh ${SERVER_USER}@${SERVER_HOST}"

echo "🔌 Connecting to ${SERVER_USER}@${SERVER_HOST}..."
echo ""

# Test SSH connection
if ! $SSH_CMD "echo 'Connection test successful'" > /dev/null 2>&1; then
    echo "❌ Failed to connect to server. Please ensure:"
    echo "   1. SSH key is set up (or password authentication is enabled)"
    echo "   2. Server is accessible at ${SERVER_HOST}"
    echo "   3. User ${SERVER_USER} exists on the server"
    exit 1
fi

echo "✅ SSH connection successful"
echo ""

# Function to run command on server and capture output
run_on_server() {
    $SSH_CMD "cd ${SERVER_PATH} && $1"
}

# Function to get build errors
get_build_errors() {
    run_on_server "npm run build 2>&1" || true
}

# Pull latest changes
echo "📥 Pulling latest changes from git..."
run_on_server "git pull origin main"
echo ""

# Build and capture output
echo "🔨 Building project..."
BUILD_OUTPUT=$(get_build_errors)
BUILD_SUCCESS=$?

# Check if build succeeded
if echo "$BUILD_OUTPUT" | grep -q "Compiled successfully" && ! echo "$BUILD_OUTPUT" | grep -q "Failed to compile"; then
    echo "✅ Build successful!"
    echo ""
    echo "$BUILD_OUTPUT" | tail -20
    exit 0
fi

# Extract errors
echo "❌ Build failed. Errors:"
echo ""
echo "$BUILD_OUTPUT" | grep -E "(Type error:|Failed to compile|\./src/)" -A 5 | head -50
echo ""
echo "📋 Full build output saved to: /tmp/ssh-build-output.txt"
echo "$BUILD_OUTPUT" > /tmp/ssh-build-output.txt
echo ""
echo "Please share the errors above for fixing."
