#!/bin/bash

# Test script for dji-log-parser CLI tool
# This script tests the CLI tool with the sample log file

# Replace YOUR_API_KEY with your actual API key, or set it as environment variable
API_KEY="${DJI_API_KEY:-YOUR_API_KEY_HERE}"

# Sample log file path
LOG_FILE="docs/DJIFlightRecord_2024-12-31_[08-40-49].txt"
OUTPUT_FILE="test-output.geojson"

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file not found: $LOG_FILE"
    exit 1
fi

# Check if CLI tool exists
if [ ! -f "dji-log-parser/dji-log" ]; then
    echo "Error: CLI tool not found at dji-log-parser/dji-log"
    exit 1
fi

# Make sure CLI tool is executable
chmod +x dji-log-parser/dji-log

echo "Testing dji-log-parser CLI tool..."
echo "Log file: $LOG_FILE"
echo "Output file: $OUTPUT_FILE"
echo ""

# Run the CLI tool
if [ "$API_KEY" != "YOUR_API_KEY_HERE" ]; then
    echo "Using API key from environment variable..."
    ./dji-log-parser/dji-log "$LOG_FILE" --api-key "$API_KEY" --geojson "$OUTPUT_FILE"
else
    echo "⚠️  No API key provided. Trying without API key (will fail for version 13+ logs)..."
    ./dji-log-parser/dji-log "$LOG_FILE" --geojson "$OUTPUT_FILE"
fi

# Check if output was created
if [ -f "$OUTPUT_FILE" ]; then
    echo ""
    echo "✅ Success! Output file created: $OUTPUT_FILE"
    echo "File size: $(wc -c < "$OUTPUT_FILE") bytes"
    echo ""
    echo "First few lines of output:"
    head -20 "$OUTPUT_FILE"
else
    echo ""
    echo "❌ Failed: Output file was not created"
fi

