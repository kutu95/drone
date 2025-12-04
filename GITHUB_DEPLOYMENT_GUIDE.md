# GitHub Deployment Guide - Automatic Updates

This guide shows you how to deploy your Drone app using GitHub with automatic updates.

## Overview

With this setup:
- ✅ Code is stored on GitHub
- ✅ Updates can be deployed automatically
- ✅ Server pulls latest changes and rebuilds
- ✅ Easy rollback if needed

## Deployment Methods

### Method 1: Manual Deploy Script (Recommended - Simple)

After pushing to GitHub, SSH to server and run:
```bash
cd ~/apps/drone
./server-deploy.sh
```

### Method 2: Automated Webhook (Automatic Updates)

GitHub webhook triggers deployment automatically when you push.

### Method 3: Scheduled Pull (Check for Updates)

Cron job checks for updates periodically and deploys automatically.

## Step-by-Step Setup

### Step 1: Initialize Git and Push to GitHub

**On your local machine:**

1. **Run the setup script:**
   ```bash
   ./setup-github.sh
   ```
   This will:
   - Initialize git (if needed)
   - Stage all files
   - Create initial commit

2. **Create GitHub Repository:**
   - Go to https://github.com/new
   - Create a new repository (e.g., `drone-app`)
   - **Don't** initialize with README, .gitignore, or license
   - Copy the repository URL

3. **Add remote and push:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

   Or using SSH:
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Initial Server Deployment

**SSH to your server:**

```bash
ssh <username>@192.168.0.146
```

1. **Clone the repository:**
   ```bash
   cd ~/apps
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git drone
   cd drone
   ```

   Or using SSH (if you have keys set up):
   ```bash
   git clone git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git drone
   cd drone
   ```

2. **Create production environment file:**
   ```bash
   nano .env.production
   ```
   
   Add your environment variables (see `ENV_VARIABLES_REFERENCE.md`):
   ```bash
   NEXT_PUBLIC_BASE_PATH=
   USE_DOMAIN=true
   NEXT_PUBLIC_SUPABASE_URL=https://uiknuzhkrljfbvxjhsxr.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   DJI_API_KEY=your-dji-key
   ```

3. **Install dependencies and build:**
   ```bash
   npm install
   npm run build
   ```

4. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

5. **Setup domain** (see DEPLOYMENT_GUIDE.md for domain setup)

6. **Make deploy script executable:**
   ```bash
   chmod +x server-deploy.sh
   ```

### Step 3: Deploy Updates

#### Option A: Manual Deploy (Simple)

After pushing changes to GitHub:

```bash
# SSH to server
ssh <username>@192.168.0.146

# Run deploy script
cd ~/apps/drone
./server-deploy.sh
```

The script will:
- Pull latest changes from GitHub
- Install any new dependencies
- Rebuild the app
- Restart with PM2

#### Option B: Automated Webhook (Advanced)

Set up a GitHub webhook to automatically deploy on push:

1. **Create webhook endpoint script on server:**
   ```bash
   # Create webhook directory
   mkdir -p ~/webhooks
   cd ~/webhooks
   
   # Create webhook script
   nano drone-deploy.php
   ```
   
   Add this content (adjust paths as needed):
   ```php
   <?php
   // Simple webhook endpoint
   $secret = 'your-webhook-secret-here'; // Change this!
   $payload = file_get_contents('php://input');
   $signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
   
   // Verify webhook (basic check)
   if ($_SERVER['REQUEST_METHOD'] === 'POST') {
       // Execute deployment
       exec('cd /home/USERNAME/apps/drone && ./server-deploy.sh > /dev/null 2>&1 &');
       http_response_code(200);
       echo "Deployment triggered";
   }
   ?>
   ```

2. **Configure GitHub Webhook:**
   - Go to your GitHub repository
   - Settings → Webhooks → Add webhook
   - Payload URL: `http://192.168.0.146/webhooks/drone-deploy.php`
   - Content type: `application/json`
   - Events: Just the `push` event
   - Save

**Note:** For production, use HTTPS and proper webhook verification. This is a basic example.

#### Option C: Scheduled Auto-Pull (Simple Automation)

Set up a cron job to check for updates every hour:

```bash
# Edit crontab
crontab -e

# Add this line (checks every hour, deploys if changes found)
0 * * * * cd ~/apps/drone && git fetch && [ $(git rev-parse HEAD) != $(git rev-parse origin/main) ] && ./server-deploy.sh >> ~/apps/drone/deploy.log 2>&1
```

Or check every 15 minutes:
```bash
*/15 * * * * cd ~/apps/drone && git fetch && [ $(git rev-parse HEAD) != $(git rev-parse origin/main) ] && ./server-deploy.sh >> ~/apps/drone/deploy.log 2>&1
```

## Workflow

### Making Updates

1. **Make changes locally:**
   ```bash
   # Edit files
   # Test locally with npm run dev
   ```

2. **Commit and push:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

3. **Deploy:**
   - **Manual:** SSH to server and run `./server-deploy.sh`
   - **Webhook:** Automatic (if configured)
   - **Cron:** Automatic (checks periodically)

## Troubleshooting

### Deploy script fails

Check the logs:
```bash
tail -f ~/apps/drone/deploy.log
```

### Build fails on server

Check build logs:
```bash
cd ~/apps/drone
npm run build
```

Common issues:
- Missing environment variables
- Node version mismatch
- Missing dependencies

### PM2 not restarting

Check PM2 status:
```bash
pm2 status
pm2 logs drone
```

### Git pull fails

Check permissions and remote:
```bash
cd ~/apps/drone
git remote -v
git fetch
```

## Security Notes

1. **Environment Variables:** Never commit `.env.production` to git
2. **GitHub Secrets:** Store sensitive data in GitHub Secrets if using Actions
3. **Webhook Security:** Use webhook secrets and HTTPS in production
4. **SSH Keys:** Use SSH keys instead of passwords for GitHub access

## Quick Reference

```bash
# Local: Push changes
git add .
git commit -m "Update"
git push origin main

# Server: Deploy updates
cd ~/apps/drone
./server-deploy.sh

# Server: Check status
pm2 status
pm2 logs drone

# Server: View deployment logs
tail -f ~/apps/drone/deploy.log
```

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Clone on server
3. ✅ Initial deployment
4. ✅ Set up automatic deployment (choose method above)
5. ✅ Test update workflow

---

**Happy deploying! 🚀**

