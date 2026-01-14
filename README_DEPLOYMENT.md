# Deployment Documentation Index

Welcome! This is your complete deployment guide for the Drone app using GitHub.

## 🚀 Quick Start

**New to GitHub deployment?** Start here:
👉 **[GITHUB_QUICK_START.md](GITHUB_QUICK_START.md)** - Get started in 5 minutes

## 📚 Complete Guides

### For GitHub Deployment

1. **[GITHUB_QUICK_START.md](GITHUB_QUICK_START.md)**
   - Fast setup (5 minutes)
   - Step-by-step instructions
   - Perfect for first-time setup

2. **[GITHUB_DEPLOYMENT_GUIDE.md](GITHUB_DEPLOYMENT_GUIDE.md)**
   - Complete deployment guide
   - All deployment methods explained
   - Webhook and automation setup
   - Troubleshooting

3. **[UPDATE_WORKFLOW.md](UPDATE_WORKFLOW.md)**
   - Daily workflow for updates
   - Quick reference commands
   - Rollback procedures

### For General Deployment

4. **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**
   - Complete deployment instructions
   - Server setup details
   - Domain configuration

5. **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)**
   - Track deployment progress
   - Step-by-step checklist

6. **[ENV_VARIABLES_REFERENCE.md](ENV_VARIABLES_REFERENCE.md)**
   - Environment variables template
   - Required vs optional variables

### For Database Migration

7. **[DATABASE_MIGRATION_GUIDE.md](contexts/DATABASE_MIGRATION_GUIDE.md)**
   - Complete guide for migrating database from cloud to local
   - Step-by-step instructions
   - Troubleshooting

8. **[DATABASE_MIGRATION_QUICKSTART.md](contexts/DATABASE_MIGRATION_QUICKSTART.md)**
   - Quick reference for database migration
   - 5-step process
   - Common commands

## 🔧 Scripts

- **`setup-github.sh`** - Initialize git and prepare for GitHub
- **`server-deploy.sh`** - Server-side deployment script (pulls, builds, restarts)
- **`prepare-deployment.sh`** - Check your environment variables
- **`migrate-database.sh`** - Automated database migration script

- **`setup-github.sh`** - Initialize git and prepare for GitHub
- **`server-deploy.sh`** - Server-side deployment script (pulls, builds, restarts)
- **`prepare-deployment.sh`** - Check your environment variables

## 📋 Deployment Process Overview

### Initial Setup

1. ✅ Run `./setup-github.sh` to initialize git
2. ✅ Create GitHub repository
3. ✅ Push code to GitHub
4. ✅ Clone on server
5. ✅ Migrate database to local Supabase (see `contexts/DATABASE_MIGRATION_GUIDE.md`)
6. ✅ Configure environment variables
7. ✅ Build and start with PM2
8. ✅ Setup domain with Cloudflare Tunnel

### Making Updates

1. ✅ Make changes locally
2. ✅ Commit and push to GitHub
3. ✅ SSH to server and run `./server-deploy.sh`
4. ✅ (Optional) Setup automatic deployment

## 🎯 Choose Your Path

### Path 1: GitHub Deployment (Recommended)
**Best for:** Automatic updates, version control, easy rollback

- Follow: `GITHUB_QUICK_START.md`
- Update workflow: `UPDATE_WORKFLOW.md`

### Path 2: Manual Deployment
**Best for:** One-time deployment, simple setup

- Follow: `DEPLOYMENT_GUIDE.md`
- Use: `DEPLOYMENT_CHECKLIST.md`

## 📝 Current Configuration

- **App Name:** drone
- **Port:** 3002
- **Server:** 192.168.0.146
- **Tunnel:** farm-cashbook
- **Git Repository:** (to be created)

## 🔑 Environment Variables

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

See `ENV_VARIABLES_REFERENCE.md` for complete list.

## 🆘 Getting Help

1. **Quick Start Issues?** → Check `GITHUB_QUICK_START.md`
2. **Deployment Errors?** → See troubleshooting in `GITHUB_DEPLOYMENT_GUIDE.md`
3. **Server Setup?** → See `DEPLOYMENT_GUIDE.md`
4. **Environment Variables?** → See `ENV_VARIABLES_REFERENCE.md`
5. **Database Migration?** → See `contexts/DATABASE_MIGRATION_GUIDE.md`

## 🎓 Learning Resources

- **Deployment Docs:** `/Users/bowskill/deployment-docs/`
- **Master Guide:** `/Users/bowskill/deployment-docs/DEPLOYMENT_MASTER_GUIDE.md`
- **Quick Reference:** `/Users/bowskill/deployment-docs/QUICK_DEPLOYMENT_REFERENCE.md`

---

## Next Steps

**Ready to deploy?** 

👉 Start with **[GITHUB_QUICK_START.md](GITHUB_QUICK_START.md)**

**Already on GitHub?**

👉 See **[UPDATE_WORKFLOW.md](UPDATE_WORKFLOW.md)** for daily workflow

---

**Happy Deploying! 🚀**

