# Update Workflow - Quick Reference

## Making Changes and Deploying

### 1. Make Changes Locally

```bash
# Edit your files
# Test locally
npm run dev
```

### 2. Commit and Push to GitHub

```bash
git add .
git commit -m "Your commit message"
git push origin main
```

### 3. Deploy to Server

#### Option A: Manual (Recommended for now)

```bash
# SSH to server
ssh <username>@192.168.0.146

# Run deploy script
cd ~/apps/drone
./server-deploy.sh
```

#### Option B: Automatic (After setup)

If you've set up webhook or cron:
- Changes deploy automatically after push
- Check deployment logs if needed

### 4. Verify Deployment

```bash
# On server, check PM2 status
pm2 status

# View logs
pm2 logs drone

# Test the site
curl -I https://your-domain.com/
```

## Rollback (If Needed)

```bash
# SSH to server
cd ~/apps/drone

# Check commit history
git log --oneline -10

# Reset to previous commit
git reset --hard <previous-commit-hash>

# Rebuild and restart
npm run build
pm2 restart drone
```

## Common Commands

```bash
# View deployment history
git log --oneline

# Check if server is up to date
git fetch
git status

# View recent deployments
tail -f deploy.log
```

