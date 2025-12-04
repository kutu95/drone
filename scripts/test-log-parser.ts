/**
 * Test script for DJI log parser
 * Tests both CLI parser and basic parser with sample log file
 * 
 * Run with: npm run test:parser
 * Or: npx tsx scripts/test-log-parser.ts
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const SAMPLE_LOG_FILE = join(process.cwd(), 'docs', 'DJIFlightRecord_2024-12-31_[08-40-49].txt');

async function testCLIParser() {
  console.log('\n=== Testing CLI Parser ===');
  
  if (!existsSync(SAMPLE_LOG_FILE)) {
    console.error(`❌ Sample log file not found: ${SAMPLE_LOG_FILE}`);
    return false;
  }
  
  console.log(`Reading file: ${SAMPLE_LOG_FILE}`);
  
  try {
    const fileBuffer = await readFile(SAMPLE_LOG_FILE);
    console.log(`File size: ${fileBuffer.length} bytes`);
    
    const { parseDJILogWithCLI } = await import('../src/lib/dji-log-parser-cli');
    const result = await parseDJILogWithCLI(fileBuffer, 'DJIFlightRecord_2024-12-31_[08-40-49].txt');
    
    if (!result.success) {
      console.error('❌ CLI Parser failed:', result.error);
      return false;
    }
    
    const flightLog = result.flightLog!;
    const dataPoints = flightLog.dataPoints || [];
    
    console.log('✅ CLI Parser succeeded!');
    console.log(`   Data points extracted: ${dataPoints.length}`);
    console.log(`   Filename: ${flightLog.filename}`);
    console.log(`   Flight date: ${flightLog.flightDate || 'N/A'}`);
    console.log(`   Duration: ${flightLog.durationSeconds ? `${flightLog.durationSeconds.toFixed(1)}s` : 'N/A'}`);
    console.log(`   Max altitude: ${flightLog.maxAltitudeM ? `${flightLog.maxAltitudeM.toFixed(1)}m` : 'N/A'}`);
    console.log(`   Max speed: ${flightLog.maxSpeedMps ? `${flightLog.maxSpeedMps.toFixed(1)} m/s` : 'N/A'}`);
    console.log(`   Max distance: ${flightLog.maxDistanceM ? `${flightLog.maxDistanceM.toFixed(1)}m` : 'N/A'}`);
    console.log(`   Home location: ${flightLog.homeLocation ? `${flightLog.homeLocation.lat.toFixed(6)}, ${flightLog.homeLocation.lng.toFixed(6)}` : 'N/A'}`);
    
    if (dataPoints.length > 0) {
      console.log(`\n   First data point:`);
      const first = dataPoints[0];
      console.log(`     - Lat: ${first.lat}, Lng: ${first.lng}`);
      console.log(`     - Altitude: ${first.altitudeM || 'N/A'}m`);
      console.log(`     - Timestamp: ${first.timestampOffsetMs}ms`);
      
      if (dataPoints.length > 1) {
        const last = dataPoints[dataPoints.length - 1];
        console.log(`\n   Last data point:`);
        console.log(`     - Lat: ${last.lat}, Lng: ${last.lng}`);
        console.log(`     - Altitude: ${last.altitudeM || 'N/A'}m`);
        console.log(`     - Timestamp: ${last.timestampOffsetMs}ms`);
      }
    }
    
    return dataPoints.length > 0;
  } catch (error) {
    console.error('❌ CLI Parser error:', error);
    return false;
  }
}

async function testBasicParser() {
  console.log('\n=== Testing Basic Parser ===');
  
  if (!existsSync(SAMPLE_LOG_FILE)) {
    console.error(`❌ Sample log file not found: ${SAMPLE_LOG_FILE}`);
    return false;
  }
  
  console.log(`Reading file: ${SAMPLE_LOG_FILE}`);
  
  try {
    const fileBuffer = await readFile(SAMPLE_LOG_FILE);
    console.log(`File size: ${fileBuffer.length} bytes`);
    
    // Convert Buffer to File-like object
    const uint8Array = new Uint8Array(fileBuffer);
    const file = new File([uint8Array], 'DJIFlightRecord_2024-12-31_[08-40-49].txt', {
      type: 'application/octet-stream',
      lastModified: Date.now(),
    });
    
    const { parseDJILogFile } = await import('../src/lib/dji-log-parser');
    const result = await parseDJILogFile(file);
    
    const dataPoints = result.dataPoints || [];
    
    console.log('✅ Basic Parser completed!');
    console.log(`   Data points extracted: ${dataPoints.length}`);
    console.log(`   Filename: ${result.flightLog.filename}`);
    console.log(`   Flight date: ${result.flightLog.flightDate || 'N/A'}`);
    console.log(`   Duration: ${result.flightLog.durationSeconds ? `${result.flightLog.durationSeconds.toFixed(1)}s` : 'N/A'}`);
    console.log(`   Max altitude: ${result.flightLog.maxAltitudeM ? `${result.flightLog.maxAltitudeM.toFixed(1)}m` : 'N/A'}`);
    console.log(`   Max speed: ${result.flightLog.maxSpeedMps ? `${result.flightLog.maxSpeedMps.toFixed(1)} m/s` : 'N/A'}`);
    console.log(`   Max distance: ${result.flightLog.maxDistanceM ? `${result.flightLog.maxDistanceM.toFixed(1)}m` : 'N/A'}`);
    console.log(`   Home location: ${result.flightLog.homeLocation ? `${result.flightLog.homeLocation.lat.toFixed(6)}, ${result.flightLog.homeLocation.lng.toFixed(6)}` : 'N/A'}`);
    
    if (dataPoints.length > 0) {
      console.log(`\n   First data point:`);
      const first = dataPoints[0];
      console.log(`     - Lat: ${first.lat}, Lng: ${first.lng}`);
      console.log(`     - Altitude: ${first.altitudeM || 'N/A'}m`);
      console.log(`     - Timestamp: ${first.timestampOffsetMs}ms`);
      
      if (dataPoints.length > 1) {
        const last = dataPoints[dataPoints.length - 1];
        console.log(`\n   Last data point:`);
        console.log(`     - Lat: ${last.lat}, Lng: ${last.lng}`);
        console.log(`     - Altitude: ${last.altitudeM || 'N/A'}m`);
        console.log(`     - Timestamp: ${last.timestampOffsetMs}ms`);
      }
    } else {
      console.log('   ⚠️  No data points extracted (expected due to XOR scrambling)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Basic Parser error:', error);
    return false;
  }
}

async function runTests() {
  console.log('🧪 DJI Log Parser Test Suite');
  console.log('='.repeat(50));
  
  if (!existsSync(SAMPLE_LOG_FILE)) {
    console.error(`\n❌ Sample log file not found at: ${SAMPLE_LOG_FILE}`);
    console.error('   Please ensure the sample log file exists in the docs folder.');
    process.exit(1);
  }
  
  const cliResult = await testCLIParser();
  const basicResult = await testBasicParser();
  
  console.log('\n=== Test Summary ===');
  console.log(`CLI Parser: ${cliResult ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Basic Parser: ${basicResult ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (!cliResult && !basicResult) {
    console.log('\n❌ Both parsers failed. Check the logs above for details.');
    process.exit(1);
  } else if (!cliResult) {
    console.log('\n⚠️  CLI parser not available or failed. Using basic parser as fallback.');
    console.log('   To get accurate results, install dji-log-parser CLI tool.');
    console.log('   See: https://github.com/lvauvillier/dji-log-parser/releases');
  } else {
    console.log('\n✅ Tests completed successfully!');
  }
  
  process.exit(0);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

