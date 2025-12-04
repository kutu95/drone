#!/bin/bash
# Script to prepare repository for GitHub and initial commit

set -e

echo "🚀 Setting up Git Repository for GitHub"
echo "======================================="
echo ""

# Check if already a git repo
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "✓ Git repository already exists"
fi

echo ""
echo "📝 Staging all files..."
git add .

echo ""
echo "📋 Files staged. Review what will be committed:"
echo "-----------------------------------------------"
git status --short

echo ""
echo "⚠️  Make sure .env files are NOT included (they should be in .gitignore)"
echo ""

read -p "Ready to commit? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit - Drone mission planner app"
    echo "✅ Initial commit created"
    echo ""
    echo "📤 Next steps:"
    echo "1. Create a new repository on GitHub"
    echo "2. Add the remote and push:"
    echo ""
    echo "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
    echo "Or use SSH:"
    echo "   git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
else
    echo "Commit cancelled. Review files and run again when ready."
    exit 1
fi

