# DCRAW Setup Guide

DCRAW is a command-line tool for decoding raw camera files, including DNG files. It extracts full-resolution images from raw data, bypassing embedded preview limitations.

## Installation

### macOS

**Option 1: Using Homebrew (Recommended)**

First, install Homebrew if you don't have it:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After Homebrew installation, you may need to add it to your PATH:
- For Apple Silicon Macs (M1/M2/M3):
  ```bash
  echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zprofile
  source ~/.zprofile
  ```
- For Intel Macs:
  ```bash
  echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zprofile
  source ~/.zprofile
  ```

Then install dcraw:
```bash
brew install dcraw
```

**Option 2: Manual Installation (Without Homebrew)**

1. Download the source code from: https://www.dechifro.org/dcraw/
2. Compile dcraw:
   ```bash
   # Download and extract
   curl -O https://www.dechifro.org/dcraw/dcraw.c
   # Compile
   gcc -o dcraw dcraw.c -lm -ljpeg -llcms2 -ljasper
   # Install (requires sudo)
   sudo mv dcraw /usr/local/bin/
   # Or install to your home directory (no sudo needed)
   mkdir -p ~/bin
   mv dcraw ~/bin/
   echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zprofile
   source ~/.zprofile
   ```

**Note:** Manual compilation requires development tools. Install Xcode Command Line Tools if needed:
```bash
xcode-select --install
```

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install dcraw
```

### Manual Installation
1. Download from: https://www.dechifro.org/dcraw/
2. Compile and install following the instructions
3. Ensure `dcraw` is in your PATH, or set the `DCRAW_PATH` environment variable

## Verify Installation

```bash
dcraw -i -v
```

This should show the dcraw version information.

## Environment Variable (Optional)

If dcraw is installed in a non-standard location, set:
```bash
export DCRAW_PATH=/path/to/dcraw
```

Or add to your `.env.local`:
```
DCRAW_PATH=/path/to/dcraw
```

## How It Works

1. DNG files are sent to the thumbnail generation API
2. The API uses `dcraw` to extract full-resolution TIFF from the raw DNG data
3. Sharp then resizes the TIFF to exactly 1200px width
4. Final JPEG thumbnail is generated and stored

This ensures true 1200px wide thumbnails from full-resolution raw data, not limited embedded previews.

## Fallback Behavior

If `dcraw` is not installed or unavailable, the system will automatically fall back to using Sharp's embedded preview extraction. However, this may result in lower resolution thumbnails depending on the embedded preview size in the DNG file.
