# Test Scripts

## Testing the DJI Log Parser

To test the log parser with the sample file:

```bash
# First, install tsx if you haven't already
npm install --save-dev tsx

# Then run the test
npm run test:parser
```

Or directly with tsx:

```bash
npx tsx scripts/test-log-parser.ts
```

The test script will:
1. Test the CLI parser (if `dji-log-parser` binary is available)
2. Test the basic heuristic parser (always available as fallback)
3. Show detailed results including:
   - Number of data points extracted
   - Flight statistics (duration, altitude, speed, distance)
   - Sample data points (first and last)

## Sample File

The test uses the sample log file at:
`docs/DJIFlightRecord_2024-12-31_[08-40-49].txt`

Make sure this file exists before running the test.

