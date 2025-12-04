# Quick Test Command

To test the CLI tool, quote the filename (zsh treats `[]` as special characters):

```bash
# Replace YOUR_API_KEY with your actual API key
./dji-log-parser/dji-log "docs/DJIFlightRecord_2024-12-31_[08-40-49].txt" --api-key YOUR_API_KEY --geojson test.geojson
```

Or use the test script (recommended):

```bash
# Set your API key
export DJI_API_KEY=your-actual-api-key-here

# Run the test script
chmod +x test-cli.sh
./test-cli.sh
```

The test script will:
- Check if files exist
- Handle the filename quoting automatically
- Show you the results
- Display the output file if successful

