# Testing the Parser

I've created two ways to test the parser:

## Option 1: API Endpoint (Easiest)

1. Make sure your Next.js dev server is running:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000/api/test-parser
   ```

   Or use curl:
   ```bash
   curl http://localhost:3000/api/test-parser | jq
   ```

This will test both the CLI parser and basic parser with the sample file and return detailed JSON results.

## Option 2: Command Line Script

1. Install tsx if needed:
   ```bash
   npm install --save-dev tsx
   ```

2. Run the test script:
   ```bash
   npm run test:parser
   ```

   Or:
   ```bash
   npx tsx scripts/test-log-parser.ts
   ```

## What Gets Tested

Both methods will:
- ✅ Read the sample log file: `docs/DJIFlightRecord_2024-12-31_[08-40-49].txt`
- ✅ Test CLI parser (if `dji-log-parser` binary is available)
- ✅ Test basic heuristic parser (always available)
- ✅ Show data points extracted, flight statistics, and sample data

## Expected Output

You'll see:
- Number of data points extracted by each parser
- Flight statistics (duration, altitude, speed, distance)
- GPS coordinates (home location, first/last points)
- Any errors or warnings

If the CLI parser is not installed, it will fall back to the basic parser automatically.

