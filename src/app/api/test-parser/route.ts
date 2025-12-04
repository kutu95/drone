import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseDJILogWithCLI } from '@/lib/dji-log-parser-cli';
import { parseDJILogFile } from '@/lib/dji-log-parser';

const SAMPLE_LOG_FILE = join(process.cwd(), 'docs', 'DJIFlightRecord_2024-12-31_[08-40-49].txt');

/**
 * API route to test the log parser with the sample file
 * GET /api/test-parser
 */
export async function GET(request: NextRequest) {
  try {
    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    // Test CLI Parser
    try {
      console.log('Testing CLI parser...');
      const fileBuffer = await readFile(SAMPLE_LOG_FILE);
      
      const cliResult = await parseDJILogWithCLI(fileBuffer, 'DJIFlightRecord_2024-12-31_[08-40-49].txt');
      
      results.cliParser = {
        success: cliResult.success,
        dataPointsCount: cliResult.flightLog?.dataPoints?.length || 0,
        filename: cliResult.flightLog?.filename,
        flightDate: cliResult.flightLog?.flightDate,
        durationSeconds: cliResult.flightLog?.durationSeconds,
        maxAltitudeM: cliResult.flightLog?.maxAltitudeM,
        maxSpeedMps: cliResult.flightLog?.maxSpeedMps,
        maxDistanceM: cliResult.flightLog?.maxDistanceM,
        homeLocation: cliResult.flightLog?.homeLocation,
        error: cliResult.error,
        parser: cliResult.flightLog?.metadata?.parser || 'unknown',
        firstDataPoint: cliResult.flightLog?.dataPoints?.[0],
        lastDataPoint: cliResult.flightLog?.dataPoints?.[cliResult.flightLog?.dataPoints?.length - 1],
      };
    } catch (error) {
      results.cliParser = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test Basic Parser
    try {
      console.log('Testing basic parser...');
      const fileBuffer = await readFile(SAMPLE_LOG_FILE);
      
      const uint8Array = new Uint8Array(fileBuffer);
      const file = new File([uint8Array], 'DJIFlightRecord_2024-12-31_[08-40-49].txt', {
        type: 'application/octet-stream',
        lastModified: Date.now(),
      });
      
      const basicResult = await parseDJILogFile(file);
      
      results.basicParser = {
        success: true,
        dataPointsCount: basicResult.dataPoints?.length || 0,
        filename: basicResult.flightLog.filename,
        flightDate: basicResult.flightLog.flightDate,
        durationSeconds: basicResult.flightLog.durationSeconds,
        maxAltitudeM: basicResult.flightLog.maxAltitudeM,
        maxSpeedMps: basicResult.flightLog.maxSpeedMps,
        maxDistanceM: basicResult.flightLog.maxDistanceM,
        homeLocation: basicResult.flightLog.homeLocation,
        parser: basicResult.flightLog.metadata?.parser || 'basic-heuristic',
        firstDataPoint: basicResult.dataPoints?.[0],
        lastDataPoint: basicResult.dataPoints?.[basicResult.dataPoints.length - 1],
      };
    } catch (error) {
      results.basicParser = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return NextResponse.json({
      success: true,
      fileSize: (await readFile(SAMPLE_LOG_FILE)).length,
      ...results,
    }, { status: 200 });
  } catch (error) {
    console.error('Test parser error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

