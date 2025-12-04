# DJI Log Parser CLI Setup Guide

This guide explains how to set up the `dji-log-parser` CLI tool for accurate DJI flight log parsing.

## Why Use dji-log-parser?

The DJI log file format uses XOR scrambling and structured records that require proper decoding. The `dji-log-parser` tool (written in Rust) provides accurate parsing of all DJI log file versions.

## Installation

### Option 1: Download Pre-built Binary (Recommended)

1. Visit the [dji-log-parser releases page](https://github.com/lvauvillier/dji-log-parser/releases)
2. Download the binary for your platform (macOS, Linux, or Windows)
3. Place the binary in your project root directory as `dji-log-parser`
4. Make it executable:
   ```bash
   chmod +x dji-log-parser
   ```

### Option 2: Build from Source

If pre-built binaries are not available for your platform:

1. Install Rust: https://www.rust-lang.org/tools/install
2. Clone the repository:
   ```bash
   git clone https://github.com/lvauvillier/dji-log-parser.git
   cd dji-log-parser
   ```
3. Build the project:
   ```bash
   cargo build --release
   ```
4. Copy the binary to your project root:
   ```bash
   cp target/release/dji-log-parser /path/to/your/project/dji-log-parser
   ```

### Option 3: Use Environment Variable

You can specify a custom path to the binary using an environment variable:

```bash
export DJI_LOG_PARSER_PATH=/path/to/dji-log-parser
```

Or in your `.env.local` file (for local development):

```
DJI_LOG_PARSER_PATH=/path/to/dji-log-parser
```

## Verification

Test that the parser is working:

```bash
./dji-log-parser --help
```

Or if using a custom path:

```bash
$DJI_LOG_PARSER_PATH --help
```

## API Key Setup (Required for Log Version 13+)

DJI log files version 13 and above are AES encrypted and require a DJI API key to decrypt. 

### How to Get a DJI API Key

1. Visit [DJI's Developer Portal](https://developer.dji.com/)
2. Create a developer account or log in
3. Register your application
4. Obtain an API key from the developer dashboard
5. Set it as an environment variable:

```bash
export DJI_API_KEY=your-api-key-here
```

Or add it to your `.env.local` file:

```
DJI_API_KEY=your-api-key-here
```

**Important**: Keep your API key secure and never commit it to version control.

## Usage

The parser is automatically called by the API route when you upload a flight log file. It:

1. Parses the binary DJI log file
2. Decrypts if needed (for version 13+ logs)
3. Unscrambles the XOR-encoded data
4. Extracts GPS coordinates, altitude, speed, and other telemetry
5. Converts to GeoJSON format
6. Our code converts GeoJSON to our database format

## Fallback Behavior

If the `dji-log-parser` CLI tool is not found, the system will automatically fall back to a basic heuristic parser. However, this fallback parser:
- ⚠️ May produce inaccurate GPS coordinates
- ⚠️ May miss some data points
- ⚠️ May calculate incorrect distances

For accurate results, **always use the dji-log-parser CLI tool**.

## Troubleshooting

### "dji-log-parser CLI tool not found"

**Solution**: Ensure the binary is in the project root or set `DJI_LOG_PARSER_PATH` environment variable.

### Permission Denied

**Solution**: Make the binary executable:
```bash
chmod +x dji-log-parser
```

### Binary Not Compatible

**Solution**: Build from source for your specific platform or architecture.

### Parsing Fails

**Solution**: 
1. Check that the log file format matches: `DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt`
2. Ensure the file is a valid DJI log file
3. Check the API logs for detailed error messages

### "API Key is required for version 13 and above"

**Solution**: Your log file is version 13+ and requires a DJI API key:
1. Obtain an API key from [DJI Developer Portal](https://developer.dji.com/)
2. Set it as an environment variable: `export DJI_API_KEY=your-key`
3. Or add to `.env.local`: `DJI_API_KEY=your-key`
4. Restart your development server

**Note**: Older log files (version 12 and below) do not require an API key.

## For Production Deployment

### Vercel Deployment

Vercel doesn't support running arbitrary binaries by default. You have a few options:

1. **Use Vercel Serverless Functions with Layer** (if supported)
2. **Convert to a server-side API** on a server that can run binaries
3. **Use a Docker container** that includes the binary
4. **Implement TypeScript parser** (Phase 2) that doesn't require external binaries

### Docker Deployment

If deploying with Docker, include the binary in your Dockerfile:

```dockerfile
# Copy dji-log-parser binary
COPY dji-log-parser /usr/local/bin/dji-log-parser
RUN chmod +x /usr/local/bin/dji-log-parser
ENV DJI_LOG_PARSER_PATH=/usr/local/bin/dji-log-parser
```

### Environment Variables

For production, set the path via environment variables in your hosting platform.

## Next Steps

Once the CLI tool is set up and working, you can:
1. Upload flight logs through the web interface
2. View accurate GPS coordinates on the map
3. See correct flight statistics (duration, distance, altitude)

For long-term maintainability, consider implementing Phase 2: a pure TypeScript parser that doesn't require external binaries.

