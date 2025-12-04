# Deployment Checklist - Drone App

## App Information

- **App Name:** drone
- **GitHub Repo:** (to be determined)
- **Domain:** (to be determined - e.g., drone.landlife.au)
- **Port:** 3002 (next available after farm-cashbook on 3001)
- **Date:** ___________

## Environment Variables Required

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps API key
- `DJI_API_KEY` - (Optional) DJI API key for log file parsing
- `DJI_LOG_PARSER_PATH` - (Optional) Path to dji-log-parser binary
- `SUPABASE_SERVICE_ROLE_KEY` - (Optional) For server-side operations

## Pre-Deployment

- [ ] Server has Node.js installed (`node --version`)
- [ ] Server has PM2 installed (`pm2 --version`)
- [ ] Cloudflare Tunnel is running (`sudo systemctl status cloudflared`)
- [ ] Port 3002 is available (`sudo netstat -tlnp | grep 3002`)
- [ ] Supabase project is set up and accessible
- [ ] Google Maps API key is obtained and configured
- [ ] (Optional) DJI API key is obtained
- [ ] (Optional) dji-log-parser binary is available for server platform

## Deployment Steps

### Step 1: Transfer App to Server

- [ ] Repository is accessible (GitHub) OR files are ready to transfer
- [ ] App copied to server at `~/apps/drone`
  ```bash
  # Option A: If using git
  cd ~/apps
  git clone <repo-url> drone
  cd drone
  
  # Option B: If transferring files
  # From local machine:
  rsync -avz --exclude node_modules --exclude .next /Users/bowskill/Documents/Drone/ user@192.168.0.146:~/apps/drone/
  ```

### Step 2: Environment Configuration

- [ ] Created `.env.production` file with all required variables
- [ ] Verified Supabase URL uses HTTPS (if Supabase is exposed through tunnel)
- [ ] Verified Google Maps API key is valid
- [ ] Set DJI_API_KEY if using log parser feature

### Step 3: Build and Install

- [ ] Installed dependencies (`npm install`)
- [ ] Built the app (`npm run build`)
- [ ] Verified build completed without errors

### Step 4: PM2 Configuration

- [ ] Created `ecosystem.config.js` with correct port (3002)
- [ ] Started app with PM2 (`pm2 start ecosystem.config.js`)
- [ ] Saved PM2 config (`pm2 save`)
- [ ] Verified app is running (`pm2 status`)
- [ ] Tested locally (`curl -I http://localhost:3002/`)

### Step 5: Domain Setup

- [ ] Chose domain name (e.g., `drone.landlife.au`)
- [ ] Created DNS record (`cloudflared tunnel route dns farm-cashbook <domain>`)
- [ ] Updated tunnel config (`~/.cloudflared/config.yml`)
  - Added ingress rule at **top** of ingress list:
    ```yaml
    - hostname: drone.landlife.au
      service: http://localhost:3002
    ```
- [ ] Restarted tunnel (`sudo systemctl restart cloudflared`)
- [ ] Verified tunnel is running (`sudo systemctl status cloudflared`)

## Testing

- [ ] Waited 1-2 minutes for DNS propagation
- [ ] Tested domain with curl (`curl -I https://drone.landlife.au/`)
- [ ] Tested in browser (incognito window)
- [ ] Verified HTTPS is working
- [ ] Checked for Mixed Content errors in browser console
- [ ] Tested login/authentication
- [ ] Verified Google Maps loads correctly
- [ ] Tested mission creation and editing
- [ ] Tested flight log upload (if applicable)
- [ ] Verified data loads correctly from Supabase

## Post-Deployment

- [ ] Noted port number (3002) in deployment docs
- [ ] Documented domain in deployment docs
- [ ] Saved deployment commands for future updates
- [ ] Tested update process (`git pull && npm run build && pm2 restart drone`)
- [ ] (Optional) Set up dji-log-parser binary on server if needed

## Notes

- **Port used:** 3002
- **Domain:** _______________
- **Special config:** _______________
- **Issues encountered:** _______________
- **Solutions applied:** _______________

---

## Quick Update Command (Save for future)

```bash
cd ~/apps/drone
git pull
npm install
npm run build
pm2 restart drone
```

## Important Reminders

1. **Supabase URL**: Must use HTTPS if Supabase is exposed through Cloudflare Tunnel
2. **Google Maps**: Ensure API key has correct domain restrictions
3. **DJI Log Parser**: Binary needs to match server architecture (likely Linux x86_64)
4. **Port Conflicts**: Always check ports in use before assigning
5. **Tunnel Config Order**: Most specific hostnames first, catch-all last

---

**Deployment Guide Reference:** `/Users/bowskill/deployment-docs/DEPLOYMENT_MASTER_GUIDE.md`

