# Deployment Summary - Drone App

I've prepared your Drone app for deployment following the guides in your `deployment-docs` repository. Here's what has been set up:

## Files Created

1. **`DEPLOYMENT_CHECKLIST.md`** - Complete checklist for tracking deployment progress
2. **`DEPLOYMENT_GUIDE.md`** - Step-by-step deployment instructions
3. **`ecosystem.config.js`** - PM2 configuration file (app will run on port 3002)
4. **`ENV_VARIABLES_REFERENCE.md`** - Template for required environment variables
5. **`DEPLOYMENT_SUMMARY.md`** - This file

## What's Ready

✅ PM2 configuration (port 3002)  
✅ Deployment checklist  
✅ Environment variables template  
✅ Step-by-step deployment guide  
✅ Reference to your deployment-docs guides  

## Next Steps

### 1. Decide on Domain Name
Choose a domain for your app (e.g., `drone.landlife.au`)

### 2. Prepare Environment Variables
Gather these values:
- Supabase URL and keys
- Google Maps API key
- (Optional) DJI API key
- (Optional) Service role key

### 3. Transfer App to Server

**Option A: Using Git (Recommended)**
- Initialize git repository if needed
- Push to GitHub
- Clone on server at `~/apps/drone`

**Option B: Direct Transfer**
- Use rsync to copy files to server (excluding node_modules, .next)

### 4. Follow Deployment Guide
Open `DEPLOYMENT_GUIDE.md` and follow the steps:
1. Configure environment variables
2. Install dependencies and build
3. Start with PM2
4. Setup domain with Cloudflare Tunnel
5. Test

## Quick Reference

- **Server IP**: 192.168.0.146
- **Tunnel Name**: farm-cashbook
- **App Port**: 3002
- **App Name**: drone

## Required Environment Variables

See `ENV_VARIABLES_REFERENCE.md` for the complete list. Minimum required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

## Important Notes

1. **Supabase URL**: Must use HTTPS if Supabase is exposed through Cloudflare Tunnel
2. **Port**: 3002 is the next available port (3001 is used by farm-cashbook)
3. **Tunnel Config**: When adding domain, place ingress rule at TOP of the list (order matters!)
4. **DJI Log Parser**: Optional binary needed only if you want to use CLI parser on server

## Documentation References

- **Master Guide**: `/Users/bowskill/deployment-docs/DEPLOYMENT_MASTER_GUIDE.md`
- **Quick Reference**: `/Users/bowskill/deployment-docs/QUICK_DEPLOYMENT_REFERENCE.md`
- **Deployment Guide**: `DEPLOYMENT_GUIDE.md` (in this directory)
- **Checklist**: `DEPLOYMENT_CHECKLIST.md` (in this directory)

## Getting Help

If you run into issues:
1. Check `DEPLOYMENT_GUIDE.md` troubleshooting section
2. Refer to deployment-docs master guide
3. Check PM2 logs: `pm2 logs drone`
4. Check tunnel logs: `sudo journalctl -u cloudflared -f`

---

**Ready to deploy!** Start with `DEPLOYMENT_GUIDE.md` for detailed instructions.

