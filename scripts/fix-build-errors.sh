#!/bin/bash
# More advanced script that attempts to fix common TypeScript errors automatically

set -e

cd ~/apps/drone || exit 1

MAX_ITERATIONS=10
ITERATION=0

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "🔄 Iteration $ITERATION/$MAX_ITERATIONS"
    echo "=================================="
    
    echo "📥 Pulling latest changes..."
    git pull origin main
    
    echo ""
    echo "🔨 Building..."
    BUILD_OUTPUT=$(npm run build 2>&1)
    BUILD_EXIT_CODE=$?
    
    if [ $BUILD_EXIT_CODE -eq 0 ]; then
        echo ""
        echo "✅ Build successful after $ITERATION iteration(s)!"
        exit 0
    fi
    
    echo ""
    echo "❌ Build failed. Error output:"
    echo "$BUILD_OUTPUT" | grep -E "Type error:|Failed to compile" -A 10 | head -30
    
    # Try to extract file and error info
    ERROR_FILE=$(echo "$BUILD_OUTPUT" | grep -oE "\./src/[^:]+" | head -1)
    ERROR_LINE=$(echo "$BUILD_OUTPUT" | grep -oE ":[0-9]+:[0-9]+" | head -1 | cut -d: -f2)
    ERROR_MSG=$(echo "$BUILD_OUTPUT" | grep -A 2 "Type error:" | head -3)
    
    if [ -z "$ERROR_FILE" ]; then
        echo ""
        echo "⚠️  Could not automatically fix. Please share the full error output."
        echo "$BUILD_OUTPUT" > /tmp/build-error-$(date +%s).txt
        echo "Error saved to: /tmp/build-error-*.txt"
        exit 1
    fi
    
    echo ""
    echo "📄 Error in: $ERROR_FILE$ERROR_LINE"
    echo "💬 Error: $ERROR_MSG"
    echo ""
    echo "⚠️  Automatic fixing not implemented yet. Please share this error for manual fixing."
    echo ""
    echo "Press Enter to continue to next iteration, or Ctrl+C to stop..."
    read
done

echo ""
echo "❌ Reached maximum iterations. Please share errors for manual fixing."
