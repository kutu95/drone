# DJI Flight Log Parser Setup

## Quick Start

For accurate GPS coordinate parsing, you need to set up the `dji-log-parser` CLI tool.

### Step 1: Download the Binary

Visit https://github.com/lvauvillier/dji-log-parser/releases and download the binary for your platform.

Place it in the project root as `dji-log-parser`:

```bash
# Example for macOS (Intel)
curl -L -o dji-log-parser https://github.com/lvauvillier/dji-log-parser/releases/latest/download/dji-log-parser-x86_64-apple-darwin

# Make executable
chmod +x dji-log-parser
```

### Step 2: Test It Works

```bash
./dji-log-parser --help
```

### Step 3: Start the Development Server

```bash
npm run dev
```

Now when you upload a flight log file, it will use the accurate parser!

## What Happens If Binary Is Missing?

If the binary is not found, the system will automatically fall back to a basic parser. However, the fallback parser may produce inaccurate GPS coordinates. **Always use the dji-log-parser binary for accurate results.**

## Alternative: Use Environment Variable

If you want to place the binary elsewhere:

```bash
export DJI_LOG_PARSER_PATH=/path/to/your/dji-log-parser
```

Or add to `.env.local`:

```
DJI_LOG_PARSER_PATH=/path/to/your/dji-log-parser
```

## Full Documentation

See `docs/dji-log-parser-setup.md` for complete setup instructions, troubleshooting, and deployment notes.

