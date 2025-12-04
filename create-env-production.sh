#!/bin/bash
# Script to create .env.production from .env.local
# Run this on the SERVER after transferring files

set -e

echo "🔧 Creating .env.production file"
echo "================================"
echo ""

if [ ! -f ".env.local" ]; then
    echo "⚠️  Note: .env.local not found on server (this is normal)"
    echo "You'll need to manually create .env.production"
    echo ""
    echo "See ENV_VARIABLES_REFERENCE.md for template"
    exit 0
fi

# Read .env.local and create .env.production
echo "Reading .env.local and creating .env.production..."
echo ""

# Extract relevant variables
cat > .env.production << 'EOF'
# Production Environment Variables for Drone App
# Generated from .env.local

# Next.js Configuration
NEXT_PUBLIC_BASE_PATH=
USE_DOMAIN=true

EOF

# Extract each variable
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    
    # Remove quotes from value if present
    value=$(echo "$value" | sed 's/^"//;s/"$//')
    
    # Only include NEXT_PUBLIC_ variables and other production vars
    if [[ "$key" =~ ^NEXT_PUBLIC_ ]] || [[ "$key" =~ ^(SUPABASE_SERVICE_ROLE_KEY|DJI_API_KEY)$ ]]; then
        echo "$key=$value" >> .env.production
    fi
done < .env.local

echo "✅ .env.production created!"
echo ""
echo "⚠️  IMPORTANT: Review .env.production and update:"
echo "   - NEXT_PUBLIC_SUPABASE_URL: Use HTTPS URL"
echo "   - If using local Supabase through tunnel, use tunnel URL"
echo ""
echo "Next: Install dependencies and build"
echo "  npm install"
echo "  npm run build"

