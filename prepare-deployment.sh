#!/bin/bash
# Deployment Preparation Script for Drone App

echo "🚀 Drone App Deployment Preparation"
echo "===================================="
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✓ Found .env.local file"
    
    # Extract key environment variables
    echo ""
    echo "📋 Current Environment Variables:"
    echo "--------------------------------"
    
    if grep -q "NEXT_PUBLIC_SUPABASE_URL" .env.local; then
        echo "✓ NEXT_PUBLIC_SUPABASE_URL is set"
        SUPABASE_URL=$(grep "NEXT_PUBLIC_SUPABASE_URL" .env.local | cut -d '=' -f2)
        echo "  Value: ${SUPABASE_URL:0:50}..."
    else
        echo "✗ NEXT_PUBLIC_SUPABASE_URL is missing"
    fi
    
    if grep -q "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.local; then
        echo "✓ NEXT_PUBLIC_SUPABASE_ANON_KEY is set"
    else
        echo "✗ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing"
    fi
    
    if grep -q "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" .env.local; then
        echo "✓ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set"
    else
        echo "✗ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing"
    fi
    
    if grep -q "SUPABASE_SERVICE_ROLE_KEY" .env.local; then
        echo "✓ SUPABASE_SERVICE_ROLE_KEY is set"
    else
        echo "⚠ SUPABASE_SERVICE_ROLE_KEY is missing (optional)"
    fi
    
    if grep -q "DJI_API_KEY" .env.local; then
        echo "✓ DJI_API_KEY is set"
    else
        echo "⚠ DJI_API_KEY is missing (optional)"
    fi
    
    echo ""
    echo "📝 Next Steps:"
    echo "1. Review the variables above"
    echo "2. Ensure all required variables are set"
    echo "3. These will be copied to .env.production on the server"
    
else
    echo "⚠ .env.local file not found"
    echo "Please create it with the required environment variables"
fi

echo ""
echo "📚 Documentation:"
echo "- Deployment Guide: DEPLOYMENT_GUIDE.md"
echo "- Checklist: DEPLOYMENT_CHECKLIST.md"
echo "- Environment Variables: ENV_VARIABLES_REFERENCE.md"
echo ""
echo "Ready to deploy? Follow DEPLOYMENT_GUIDE.md"

