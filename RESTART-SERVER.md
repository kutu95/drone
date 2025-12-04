# Restart Next.js Dev Server

To restart your Next.js development server:

## If running in terminal:

1. **Stop the server**: Press `Ctrl+C` in the terminal where it's running
2. **Start it again**:
   ```bash
   npm run dev
   ```

## Or if you need to kill the process:

```bash
# Find the process
lsof -ti:3000

# Kill it (replace PID with the number from above)
kill -9 $(lsof -ti:3000)

# Or on macOS/Linux:
pkill -f "next dev"

# Then start again
npm run dev
```

After restarting, the server will load the updated code that can find the CLI tool at `dji-log-parser/dji-log`.

