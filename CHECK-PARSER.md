# Checking Parser Setup

Your `dji-log-parser` binary is in: `dji-log-parser/dji-log`

The code should now automatically find it. However, you need to:

1. **Make sure the binary is executable:**
   ```bash
   chmod +x dji-log-parser/dji-log
   ```

2. **Restart your Next.js dev server** (important - the code changes need to load)

3. **Test it again** by going to: `http://localhost:3000/test-parser`

If it still doesn't work, you can also move the binary to the project root:

```bash
# Move the binary to project root
mv dji-log-parser/dji-log ./dji-log-parser
chmod +x dji-log-parser
```

Or set an environment variable:

```bash
export DJI_LOG_PARSER_PATH=/absolute/path/to/dji-log-parser/dji-log
```

Then restart your dev server.

