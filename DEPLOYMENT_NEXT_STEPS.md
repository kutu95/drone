# Deployment Next Steps - Ready to Go! 🚀

Great! Your environment variables are all set. Here's what to do next:

## ✅ What's Ready

- ✓ All environment variables configured
- ✓ Deployment scripts created
- ✓ PM2 configuration ready
- ✓ Deployment documentation complete

## 🎯 Quick Start - 3 Options

### Option 1: Automated Transfer (Easiest)

1. **Transfer files to server:**
   ```bash
   ./deploy-to-server.sh
   ```
   Or if your username is different:
   ```bash
   ./deploy-to-server.sh your-username
   ```

2. **SSH into server and continue:**
   ```bash
   ssh <username>@192.168.0.146
   cd ~/apps/drone
   ```

3. **Create production environment file:**
   - Option A: Copy manually from ENV_VARIABLES_REFERENCE.md
   - Option B: If .env.local was transferred, you can extract variables

4. **Build and start:**
   ```bash
   npm install
   npm run build
   pm2 start ecosystem.config.js
   pm2 save
   ```

### Option 2: Manual Transfer

1. **SSH into server:**
   ```bash
   ssh <username>@192.168.0.146
   ```

2. **Create app directory:**
   ```bash
   mkdir -p ~/apps/drone
   cd ~/apps/drone
   ```

3. **From your local machine, transfer files:**
   ```bash
   rsync -avz \
     --exclude node_modules \
     --exclude .next \
     --exclude .git \
     --exclude '.env*' \
     /Users/bowskill/Documents/Drone/ \
     <username>@192.168.0.146:~/apps/drone/
   ```

### Option 3: Using Git (Best for updates)

1. **Initialize git repository:**
   ```bash
   cd /Users/bowskill/Documents/Drone
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub** (create repo first on GitHub)

3. **On server, clone:**
   ```bash
   ssh <username>@192.168.0.146
   cd ~/apps
   git clone <your-repo-url> drone
   cd drone
   ```

## 📋 Environment Variables on Server

You need to create `.env.production` on the server with these values:

### Required Variables

```bash
NEXT_PUBLIC_BASE_PATH=
USE_DOMAIN=true
NEXT_PUBLIC_SUPABASE_URL=https://uiknuzhkrljfbvxjhsxr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your-google-maps-key>
```

### Optional Variables

```bash
SUPABASE_SERVICE_ROLE_KEY=<your-service-key>
DJI_API_KEY=<your-dji-key>
```

**⚠️ Important:** 
- Use HTTPS URLs for Supabase
- If Supabase is through Cloudflare Tunnel, use the tunnel URL

## 🔧 After Transfer - On Server

1. **Install dependencies:**
   ```bash
   cd ~/apps/drone
   npm install
   ```

2. **Build the app:**
   ```bash
   npm run build
   ```

3. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 status  # Verify it's running
   ```

4. **Test locally:**
   ```bash
   curl -I http://localhost:3002/
   ```

## 🌐 Setup Domain

1. **Choose domain** (e.g., `drone.landlife.au`)

2. **Create DNS record:**
   ```bash
   cloudflared tunnel route dns farm-cashbook drone.landlife.au
   ```

3. **Update tunnel config:**
   ```bash
   nano ~/.cloudflared/config.yml
   ```
   
   Add at the **TOP** of ingress list:
   ```yaml
   ingress:
     # NEW - Drone app
     - hostname: drone.landlife.au
       service: http://localhost:3002
     
     # Existing apps below...
   ```

4. **Restart tunnel:**
   ```bash
   sudo systemctl restart cloudflared
   sudo systemctl status cloudflared
   ```

5. **Test (wait 1-2 min for DNS):**
   ```bash
   curl -I https://drone.landlife.au/
   ```

## 🆘 Need Help?

- **Full Guide**: See `DEPLOYMENT_GUIDE.md`
- **Checklist**: See `DEPLOYMENT_CHECKLIST.md`
- **Troubleshooting**: See deployment guide troubleshooting section

## 📝 Current Status

- **Port**: 3002
- **App Name**: drone
- **Server**: 192.168.0.146
- **Tunnel**: farm-cashbook

---

**Ready? Start with Option 1 (automated transfer) or choose your preferred method above!**

