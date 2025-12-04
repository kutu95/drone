# 🚀 Start Deployment Here!

This is your deployment starting point. Follow these steps in order.

## Step 1: Prepare Environment Variables ✅

You already have a `.env.local` file with your environment variables. We need to gather them for the production deployment.

**Run this to check what you have:**
```bash
./prepare-deployment.sh
```

## Step 2: Choose Your Deployment Method

### Option A: Using Git (Recommended for future updates)
- Initialize git repository
- Push to GitHub
- Clone on server

### Option B: Direct Transfer (Faster for initial deployment)
- Transfer files directly using rsync

## Step 3: Decide on Domain Name

Choose a subdomain for your app, for example:
- `drone.landlife.au`
- `drone-app.landlife.au`
- Or your preferred domain

## Step 4: Gather Information

Before connecting to server, you'll need:

1. **Server SSH Access**
   - Username: (usually `john` based on deployment docs)
   - Server IP: `192.168.0.146`
   - Ensure you have SSH key or password access

2. **Environment Variables** (from your .env.local):
   - Supabase URL
   - Supabase Anon Key
   - Google Maps API Key
   - (Optional) Service Role Key
   - (Optional) DJI API Key

3. **Domain Name**
   - The subdomain you want to use

## Step 5: Connect to Server

Test your connection:
```bash
ssh <username>@192.168.0.146
```

If you can connect successfully, proceed to Step 6.

## Step 6: Follow Deployment Guide

Open **`DEPLOYMENT_GUIDE.md`** and follow the step-by-step instructions.

## Quick Checklist

- [ ] Environment variables ready (run `./prepare-deployment.sh`)
- [ ] SSH access to server works
- [ ] Domain name chosen
- [ ] Ready to transfer files

## Need Help?

- **Full Guide**: See `DEPLOYMENT_GUIDE.md`
- **Quick Reference**: See `DEPLOYMENT_SUMMARY.md`
- **Checklist**: See `DEPLOYMENT_CHECKLIST.md`
- **Master Guide**: See `/Users/bowskill/deployment-docs/DEPLOYMENT_MASTER_GUIDE.md`

---

**Let's start!** Run `./prepare-deployment.sh` to see what environment variables you have ready.

