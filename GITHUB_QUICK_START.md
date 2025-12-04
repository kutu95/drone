# GitHub Deployment - Quick Start 🚀

Get your app on GitHub and set up automatic deployments in 5 minutes!

## Step 1: Prepare Repository (2 minutes)

Run this on your local machine:

```bash
./setup-github.sh
```

This will:
- Initialize git repository
- Stage all files
- Create initial commit

## Step 2: Create GitHub Repository (1 minute)

1. Go to https://github.com/new
2. Repository name: `drone-app` (or your choice)
3. **Important:** Don't check "Initialize with README"
4. Click "Create repository"

## Step 3: Push to GitHub (1 minute)

Copy the commands GitHub shows you, or use:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your values.

## Step 4: Deploy to Server (2 minutes)

**SSH to your server:**

```bash
ssh <username>@192.168.0.146
```

**Clone and setup:**

```bash
cd ~/apps
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git drone
cd drone

# Create production environment file
nano .env.production
# (Add your environment variables - see ENV_VARIABLES_REFERENCE.md)

# Install and build
npm install
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

# Make deploy script executable
chmod +x server-deploy.sh
```

## Step 5: Test Deployment (30 seconds)

**On server, test the deploy script:**

```bash
./server-deploy.sh
```

It should pull, build, and restart the app.

## That's It! ✅

Now when you make changes:

1. **Locally:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

2. **On server:**
   ```bash
   cd ~/apps/drone
   ./server-deploy.sh
   ```

## Optional: Automatic Deployments

See `GITHUB_DEPLOYMENT_GUIDE.md` for:
- Webhook-based automatic deployment
- Scheduled auto-pull
- GitHub Actions setup

## What's Next?

- ✅ Code is on GitHub
- ✅ Server can pull and deploy
- ⏳ Setup domain (see DEPLOYMENT_GUIDE.md)
- ⏳ Configure automatic deployments (optional)

---

**Need help?** See `GITHUB_DEPLOYMENT_GUIDE.md` for detailed instructions.

