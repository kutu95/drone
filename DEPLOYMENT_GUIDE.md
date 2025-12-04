# Deployment Guide - Drone App

This guide will help you deploy the Drone app to your server using the deployment process from your deployment-docs repository.

## Quick Start

Follow these steps in order:

1. **Prepare the app** (on your local machine or server)
2. **Transfer to server** (if not using git)
3. **Configure environment variables**
4. **Build and start with PM2**
5. **Setup domain with Cloudflare Tunnel**

## Detailed Steps

### Step 1: Prepare App Files

First, ensure you have everything ready:

```bash
# Check you have all necessary files
cd /Users/bowskill/Documents/Drone
ls -la ecosystem.config.js  # Should exist now
```

### Step 2: Transfer to Server

**Option A: Using Git (Recommended)**

1. Initialize git repository if not already:
   ```bash
   cd /Users/bowskill/Documents/Drone
   git init
   git add .
   git commit -m "Initial commit for deployment"
   ```

2. Create a GitHub repository and push:
   ```bash
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

3. On server, clone the repository:
   ```bash
   ssh user@192.168.0.146
   cd ~/apps
   git clone <your-github-repo-url> drone
   cd drone
   ```

**Option B: Direct Transfer**

```bash
# From your local machine
rsync -avz \
  --exclude node_modules \
  --exclude .next \
  --exclude '.env*' \
  --exclude '.git' \
  /Users/bowskill/Documents/Drone/ \
  user@192.168.0.146:~/apps/drone/
```

### Step 3: Configure Environment Variables

On the server:

```bash
cd ~/apps/drone

# Create .env.production file
nano .env.production
```

Copy the contents from `ENV_VARIABLES_REFERENCE.md` and fill in your actual values:

```bash
# Required variables
NEXT_PUBLIC_BASE_PATH=
USE_DOMAIN=true
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key

# Optional (if using)
DJI_API_KEY=your-dji-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

**Important Notes:**
- If using local Supabase through Cloudflare Tunnel, use the HTTPS tunnel URL
- Ensure all URLs use HTTPS to avoid Mixed Content errors

### Step 4: Install Dependencies and Build

```bash
cd ~/apps/drone

# Install dependencies
npm install

# Build the app
npm run build
```

If build succeeds, you're ready to start!

### Step 5: Start with PM2

```bash
# Start the app
pm2 start ecosystem.config.js

# Save PM2 configuration (so it starts on server reboot)
pm2 save

# Check status
pm2 status

# View logs if needed
pm2 logs drone
```

### Step 6: Test Locally

```bash
# Test that the app is running
curl -I http://localhost:3002/

# Should return HTTP 200 or 307 redirect
```

### Step 7: Setup Domain with Cloudflare Tunnel

1. **Choose a domain name** (e.g., `drone.landlife.au`)

2. **Create DNS record:**
   ```bash
   cloudflared tunnel route dns farm-cashbook drone.landlife.au
   ```

3. **Update tunnel configuration:**
   ```bash
   # Backup existing config
   cp ~/.cloudflared/config.yml ~/.cloudflared/config.yml.backup
   
   # Edit the config
   nano ~/.cloudflared/config.yml
   ```

   Add this rule at the **TOP** of the ingress list (order matters!):
   ```yaml
   ingress:
     # NEW - Drone app
     - hostname: drone.landlife.au
       service: http://localhost:3002
     
     # Existing apps below...
     - hostname: books.landlife.au
       service: http://localhost:3001
     
     # ... rest of config
   ```

4. **Restart the tunnel:**
   ```bash
   sudo systemctl restart cloudflared
   
   # Check status
   sudo systemctl status cloudflared
   ```

### Step 8: Test Domain

Wait 1-2 minutes for DNS propagation, then:

```bash
# Test with curl
curl -I https://drone.landlife.au/

# Should return HTTP response
```

Then open in browser (use incognito to avoid cache issues).

## Troubleshooting

### App won't start

```bash
# Check PM2 logs
pm2 logs drone --lines 50

# Check if port is in use
sudo netstat -tlnp | grep 3002

# Restart app
pm2 restart drone
```

### Domain not accessible

1. Check tunnel status:
   ```bash
   sudo systemctl status cloudflared
   ```

2. Check tunnel logs:
   ```bash
   sudo journalctl -u cloudflared -n 50 --no-pager
   ```

3. Verify tunnel config:
   ```bash
   cat ~/.cloudflared/config.yml
   ```

4. Check DNS:
   ```bash
   nslookup drone.landlife.au
   cloudflared tunnel route dns list farm-cashbook
   ```

### Mixed Content Errors

If you see HTTPS/HTTP mixed content errors:
- Ensure Supabase URL uses HTTPS
- If using local Supabase, expose it through Cloudflare Tunnel with HTTPS

### Google Maps not loading

- Verify API key is correct
- Check API key restrictions in Google Cloud Console
- Ensure domain is allowed in API key restrictions

## Updating the App

When you make changes:

```bash
cd ~/apps/drone

# Pull latest changes (if using git)
git pull

# Or transfer new files manually

# Rebuild
npm install
npm run build

# Restart
pm2 restart drone
```

## Additional Setup

### DJI Log Parser Binary (Optional)

If you want to use the CLI parser on the server:

1. Download binary for Linux x86_64:
   ```bash
   cd ~/apps/drone
   curl -L -o dji-log-parser https://github.com/lvauvillier/dji-log-parser/releases/latest/download/dji-log-parser-x86_64-unknown-linux-gnu
   chmod +x dji-log-parser
   ```

2. Update `.env.production`:
   ```bash
   DJI_LOG_PARSER_PATH=/home/user/apps/drone/dji-log-parser
   ```

3. Restart app:
   ```bash
   pm2 restart drone
   ```

### Supabase Database Migrations

If you need to run migrations:

```bash
# Connect to Supabase and run migrations from supabase/migrations/
# Or use Supabase CLI if installed
```

## Reference

- **Deployment Master Guide**: `/Users/bowskill/deployment-docs/DEPLOYMENT_MASTER_GUIDE.md`
- **Quick Reference**: `/Users/bowskill/deployment-docs/QUICK_DEPLOYMENT_REFERENCE.md`
- **Checklist**: See `DEPLOYMENT_CHECKLIST.md`

## Server Details

- **Server IP**: 192.168.0.146
- **Tunnel Name**: farm-cashbook
- **App Port**: 3002
- **Domain**: (to be determined)

---

**Happy Deploying! 🚀**

