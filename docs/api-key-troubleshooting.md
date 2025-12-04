# DJI API Key Troubleshooting

If you're getting "Unable to fetch keychain: ApiKeyError" when parsing log files, follow these steps:

## Verify Your API Key

### 1. Check API Key Format
- Your API key should be a complete string (usually 32 characters or more)
- Make sure there are no extra spaces or line breaks when copying it
- Verify it's exactly as shown in the DJI Developer Portal

### 2. Check Environment Variable
Verify the API key is set correctly:

```bash
# Check if the variable is set
echo $DJI_API_KEY

# Or check in your .env.local file
cat .env.local | grep DJI_API_KEY
```

Make sure:
- There are no quotes around the key (unless your shell requires them)
- There's no trailing whitespace
- The file is saved correctly

### 3. Verify API Key Permissions

In the DJI Developer Portal:
1. Log in to https://developer.dji.com/
2. Go to your application settings
3. Check that your API key has access to:
   - Flight Log Decryption
   - Log File Services
   - Any log-related permissions

### 4. Test API Key Directly

Try using the CLI tool directly from terminal. **Note**: In zsh, you need to quote filenames with square brackets:

```bash
# Test with your API key (quote the filename to handle brackets in zsh)
./dji-log-parser/dji-log "docs/DJIFlightRecord_2024-12-31_[08-40-49].txt" \
  --api-key YOUR_API_KEY_HERE \
  --geojson test-output.geojson

# Or use the test script:
chmod +x test-cli.sh
export DJI_API_KEY=your-key-here
./test-cli.sh
```

**Tip**: In zsh/bash, square brackets `[]` are special characters. Always quote filenames that contain them.

If this works, the API key is valid but might not be getting to the server correctly.
If this fails, the API key itself is the problem.

### 5. Check Network Connectivity

The tool needs to reach DJI's servers to fetch the keychain. Verify:

```bash
# Test connectivity to DJI servers
curl -I https://developer.dji.com/
```

If you're behind a corporate firewall or VPN, ensure DJI's API servers are accessible.

### 6. Check API Key Status

In the DJI Developer Portal:
- Verify the API key is active (not expired or revoked)
- Check if there are any rate limits or usage restrictions
- Ensure your developer account is in good standing

## Alternative Solutions

### Option 1: Use Older Log Files
If you have access to log files from older firmware versions (version 12 and below), these don't require an API key.

### Option 2: Contact DJI Support
If your API key should work but doesn't, contact DJI Developer Support:
- https://developer.dji.com/support
- Explain you're trying to parse flight logs and your API key isn't working

### Option 3: Manual Parsing
For one-off parsing needs, you might be able to use DJI's online tools or other third-party parsers that have their own API key setup.

## Common Issues

### API Key in .env.local Not Loading
- Make sure `.env.local` is in your project root (same directory as `package.json`)
- Restart your Next.js dev server after changing `.env.local`
- Next.js only loads `.env.local` at startup

### API Key Truncated
- If your API key appears truncated in error messages, check if it's being cut off
- Some systems have length limits - verify the full key is stored

### Different Environments
- Remember: environment variables in `.env.local` are only for local development
- For production, set `DJI_API_KEY` in your hosting platform's environment variables

## Getting Help

If none of these steps resolve the issue:
1. Verify your API key works directly with the CLI tool
2. Check DJI Developer Portal for API key status
3. Review DJI's documentation: https://github.com/lvauvillier/dji-log-parser
4. Open an issue on the dji-log-parser GitHub repository if it's a tool issue

