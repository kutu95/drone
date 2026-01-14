#!/bin/bash
# Auto-fix build errors script
# This script pulls, builds, and attempts to fix common TypeScript errors

set -e

cd ~/apps/drone || exit 1

echo "🔄 Pulling latest changes..."
git pull origin main

echo ""
echo "🔨 Building..."
npm run build 2>&1 | tee /tmp/build-output.txt

BUILD_EXIT_CODE=${PIPESTATUS[0]}

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    exit 0
fi

echo ""
echo "❌ Build failed. Analyzing errors..."

# Extract TypeScript errors
ERRORS=$(grep -E "Type error:|Failed to compile" /tmp/build-output.txt -A 5 | head -50)

if [ -z "$ERRORS" ]; then
    echo "Could not parse errors. Full output:"
    cat /tmp/build-output.txt
    exit 1
fi

echo ""
echo "📋 Errors found:"
echo "$ERRORS"
echo ""
echo "📝 Please share the errors above with the assistant for fixing."
