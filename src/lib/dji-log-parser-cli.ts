import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdtemp, access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FlightLog, FlightLogDataPoint } from './types';

const execFileAsync = promisify(execFile);

interface ParseResult {
  success: boolean;
  flightLog?: Partial<FlightLog>;
  error?: string;
}

/**
 * Path to dji-log-parser CLI tool
 * Set this via environment variable DJI_LOG_PARSER_PATH
 * or place binary in project root as 'dji-log-parser' or 'dji-log-parser/dji-log'
 */
const DJI_LOG_PARSER_PATH = process.env.DJI_LOG_PARSER_PATH || 
  (() => {
    const rootPath = join(process.cwd(), 'dji-log-parser');
    const rootBinary = join(process.cwd(), 'dji-log-parser', 'dji-log');
    // Check for dji-log-parser/dji-log first (common extraction location)
    // Then check for dji-log-parser in root
    // We'll check which exists at runtime
    return rootBinary;
  })();

/**
 * Parse DJI flight log using dji-log-parser CLI tool
 * Falls back to basic parser if CLI tool is not available
 */
export async function parseDJILogWithCLI(
  fileBuffer: Buffer,
  filename: string
): Promise<ParseResult> {
  let tempDir: string | null = null;
  let inputFile: string | null = null;
  let outputFile: string | null = null;

  try {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), 'dji-log-parse-'));
    inputFile = join(tempDir, filename);
    outputFile = join(tempDir, `${filename}.geojson`);

    // Write file to temp directory
    await writeFile(inputFile, fileBuffer);

    // Try to parse with CLI tool
    try {
      // Check multiple possible locations for the binary
      const possiblePaths = [
        DJI_LOG_PARSER_PATH,
        join(process.cwd(), 'dji-log-parser', 'dji-log'),
        join(process.cwd(), 'dji-log-parser'),
        join(process.cwd(), 'dji-log'),
      ];
      
      let cliPath: string | null = null;
      
      for (const path of possiblePaths) {
        try {
          await access(path, constants.F_OK);
          // Check if it's executable (stat will tell us, but for now just check if it exists)
          cliPath = path;
          console.log(`Found CLI tool at: ${cliPath}`);
          break;
        } catch {
          // Path doesn't exist, try next
        }
      }
      
      if (!cliPath) {
        const checkedPaths = possiblePaths.map(p => `  - ${p}`).join('\n');
        throw new Error(`CLI tool not found. Checked paths:\n${checkedPaths}\n\nPlease ensure the dji-log-parser binary is installed. See README-PARSER-SETUP.md for instructions.`);
      }
      
      console.log(`✓ Found CLI tool at: ${cliPath}`);
      console.log(`Attempting to parse with CLI tool...`);
      
      // Try to execute the CLI tool
      // First, check what commands the tool accepts by trying --help
      console.log(`Checking CLI tool help...`);
      try {
        const helpResult = await execFileAsync(cliPath, ['--help'], { timeout: 5000 });
        console.log('CLI help output:', helpResult.stdout?.toString());
      } catch (helpError: any) {
        // Help might exit with code 1, that's okay, we just want to see the output
        console.log('CLI help output:', helpError.stdout?.toString() || helpError.stderr?.toString());
      }
      
      // Try to execute the CLI tool
      // Correct syntax: dji-log <FILE> --geojson <OUTPUT_FILE> [--api-key <API_KEY>]
      // Note: Log files version 13+ require a DJI API key
      const apiKey = process.env.DJI_API_KEY;
      const cliArgs = [inputFile];  // File as first positional argument
      
      if (apiKey) {
        cliArgs.push('--api-key', apiKey);
        console.log(`Using DJI API key for decryption (required for version 13+ logs)`);
      } else {
        console.warn('⚠️  No DJI_API_KEY environment variable set. Log files version 13+ require an API key.');
      }
      
      // Try to get frames format: run without --geojson first to capture JSON with frames to stdout
      // If stdout is too large or fails, fallback to --geojson file output
      // Note: We need frame-level data for camera.isPhoto detection
      cliArgs.push('--geojson', outputFile);  // Still create GeoJSON file as fallback
      
      let execResult: any = null;
      let stdoutContent: string | null = null;
      
      try {
        console.log(`Executing CLI tool: ${cliPath} ${cliArgs.join(' ')}`);
        execResult = await execFileAsync(cliPath, cliArgs, {
          timeout: 60000, // 60 second timeout for large files
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer (increased for large log files)
        });
        console.log('CLI execution succeeded');
        
        // Capture stdout in case the output file isn't created
        if (execResult.stdout) {
          const stdoutStr = execResult.stdout.toString();
          if (stdoutStr && stdoutStr.length > 0) {
            stdoutContent = stdoutStr;
            console.log(`Captured ${(stdoutStr.length / 1024).toFixed(2)} KB from stdout`);
          }
        }
        
        // Don't log stderr unless it's small
        if (execResult.stderr) {
          const stderrStr = execResult.stderr.toString();
          if (stderrStr && stderrStr.length < 500) {
            console.log('CLI stderr:', stderrStr);
          }
        }
      } catch (execError: any) {
        // Capture stdout even on error (might be maxBuffer error but data still there)
        if (execError.stdout) {
          const stdoutStr = execError.stdout.toString();
          if (stdoutStr && stdoutStr.length > 0) {
            stdoutContent = stdoutStr;
            console.log(`Captured ${(stdoutStr.length / 1024).toFixed(2)} KB from stdout (on error)`);
          }
        }
        console.error('CLI execution failed:', {
          message: execError?.message,
          code: execError?.code,
          stdout: execError?.stdout?.toString(),
          stderr: execError?.stderr?.toString(),
        });
        
        // Check if it's a permission error
        if (execError?.code === 'EACCES' || execError?.message?.includes('EACCES')) {
          throw new Error(`CLI tool found at ${cliPath} but is not executable. Run: chmod +x "${cliPath}"`);
        }
        
        // Check if it's an API key error
        const stderr = execError?.stderr?.toString() || '';
        const errorMsg = execError?.message || 'Unknown error';
        
        if (stderr.includes('API Key is required') || errorMsg.includes('API Key is required')) {
          throw new Error(`DJI API Key required: This log file is version 13 or above and requires a DJI API key for decryption. Set the DJI_API_KEY environment variable. See README-PARSER-SETUP.md for instructions on obtaining an API key.`);
        }
        
        if (stderr.includes('Unable to fetch keychain') || stderr.includes('ApiKeyError')) {
          throw new Error(`DJI API Key Error: Unable to fetch keychain from DJI servers. This usually means:\n1. The API key is invalid or incorrect\n2. The API key doesn't have the required permissions\n3. There's a network connectivity issue\n\nPlease verify your DJI_API_KEY is correct and has access to log file decryption. Check the DJI Developer Portal to ensure your API key is properly configured.`);
        }
        
        // Check if it's a maxBuffer error - the tool may have succeeded but stdout was too large
        if (errorMsg.includes('maxBuffer') || errorMsg.includes('stdout maxBuffer') || execError?.code === 'ENOBUFS') {
          console.warn('⚠️  Hit maxBuffer limit - checking if output file was created');
          try {
            await access(outputFile);
            const fileStats = await readFile(outputFile, 'utf-8');
            if (fileStats.length === 0) {
              console.warn('⚠️  Output file exists but is empty. Tool may have output to stdout only.');
              // Try to parse partial stdout if available
              const stdout = execError?.stdout?.toString();
              if (stdout && stdout.length > 0) {
                console.log('Attempting to parse stdout output...');
                try {
                  // Try to find and parse JSON in stdout
                  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                  if (jsonMatch && jsonMatch[0].length > 100) {
                    const parsedStdout = JSON.parse(jsonMatch[0]);
                    console.log('✓ Successfully parsed stdout, converting...');
                    return convertGeoJSONToFlightLog(parsedStdout, filename);
                  }
                } catch (parseErr) {
                  console.error('Failed to parse stdout:', parseErr);
                }
              }
            }
            console.log('✓ Output file exists despite buffer error, reading from file');
            // Continue to read from file below
          } catch (fileError) {
            // Try to use stdout if file doesn't exist
            const stdout = execError?.stdout?.toString();
            if (stdout && stdout.length > 0) {
              console.log('Output file not found, but stdout has data. Attempting to parse stdout...');
              try {
                // Try to parse JSON from stdout (might be partial)
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsedStdout = JSON.parse(jsonMatch[0]);
                  return convertGeoJSONToFlightLog(parsedStdout, filename);
                }
              } catch (parseErr) {
                // Fall through to error
              }
            }
            throw new Error(`CLI tool output exceeded buffer limit and output file not found. The log file may be too large. Output file expected at: ${outputFile}`);
          }
        } else {
          // Re-throw other errors with details
          const stdout = execError?.stdout?.toString() || '';
          throw new Error(`CLI tool execution failed: ${errorMsg}. ${stderr ? `stderr: ${stderr}` : ''}`);
        }
      }

      // Read and parse output
      // PRIORITY: Check stdout first - it often contains frames format with camera data
      // The CLI tool outputs frames JSON to stdout even when --geojson creates a summary file
      let contentToParse: string | null = null;
      
      // First, try parsing stdout if it's large (likely contains frames format)
      if (stdoutContent && stdoutContent.length > 100000) { // > 100KB likely has frames
        console.log(`📦 Large stdout detected (${(stdoutContent.length / 1024).toFixed(2)} KB) - checking for frames format...`);
        try {
          const stdoutParsed = JSON.parse(stdoutContent);
          // Check if stdout has frames array (this is what we want for photo detection!)
          if (stdoutParsed.frames && Array.isArray(stdoutParsed.frames) && stdoutParsed.frames.length > 0) {
            console.log(`✅ Found frames format in stdout with ${stdoutParsed.frames.length} frames - using this for photo detection!`);
            // Use stdout parsed data directly - it has frame-level camera data
            const result = convertGeoJSONToFlightLog(stdoutParsed, filename);
            if (result.success) {
              return result; // Success! Return early with frames data
            }
            console.warn('⚠️  Stdout had frames but conversion failed, falling back to file...');
          } else {
            console.log(`📄 Stdout doesn't have frames format, will check GeoJSON file`);
          }
        } catch (stdoutParseError) {
          console.warn('⚠️  Could not parse stdout as JSON, will use GeoJSON file:', stdoutParseError);
        }
      }
      
      // Fallback: Read from the GeoJSON output file
      let outputContent: string | null = null;
      try {
        await access(outputFile);
        console.log(`✓ Output file exists: ${outputFile}`);
        outputContent = await readFile(outputFile, 'utf-8');
        console.log(`Output file size: ${(outputContent.length / 1024).toFixed(2)} KB`);
        
        if (!outputContent || outputContent.trim().length === 0) {
          console.warn('⚠️  Output file is empty');
          outputContent = null;
        }
      } catch (fileError) {
        console.warn('⚠️  Output file not found or not readable:', fileError);
        outputContent = null;
      }
      
      // Use file content if stdout wasn't used
      if (!contentToParse) {
        if (outputContent) {
          contentToParse = outputContent;
        } else if (stdoutContent) {
          console.log('⚠️  Output file not available, using stdout content as fallback');
          contentToParse = stdoutContent;
        }
      }
      
      if (!contentToParse || contentToParse.trim().length === 0) {
        throw new Error('CLI tool did not produce any output. Check that the tool executed successfully and the log file is valid.');
      }
      
      let parsedOutput: any;
      try {
        parsedOutput = JSON.parse(contentToParse);
        console.log(`✓ Parsed JSON successfully`);
        console.log(`  Keys:`, Object.keys(parsedOutput));
        console.log(`  Has features:`, !!parsedOutput.features, `(count: ${parsedOutput.features?.length || 0})`);
        console.log(`  Has frames:`, !!parsedOutput.frames, `(count: ${parsedOutput.frames?.length || 0})`);
        console.log(`  Has version:`, !!parsedOutput.version);
        
        // Log a sample of the structure
        if (parsedOutput.features && parsedOutput.features.length > 0) {
          console.log(`  Sample feature keys:`, Object.keys(parsedOutput.features[0]));
        }
        if (parsedOutput.frames && parsedOutput.frames.length > 0) {
          console.log(`  Sample frame keys:`, Object.keys(parsedOutput.frames[0]));
          if (parsedOutput.frames[0].osd) {
            const osdSample = parsedOutput.frames[0].osd;
            console.log(`  Sample frame OSD has:`, Object.keys(osdSample));
            console.log(`  Sample frame GPS:`, osdSample.latitude, osdSample.longitude);
          }
          if (parsedOutput.frames[0].camera) {
            const cameraSample = parsedOutput.frames[0].camera;
            console.log(`  Sample frame camera has:`, Object.keys(cameraSample));
            console.log(`  Sample frame camera.isPhoto:`, cameraSample.isPhoto);
          }
        }
        // Log summary/details section for photo count
        if (parsedOutput.details) {
          console.log(`  Details section:`, Object.keys(parsedOutput.details));
          console.log(`  Details photoNum:`, parsedOutput.details.photoNum);
        }
      } catch (parseError) {
        console.error('Failed to parse output as JSON:', parseError);
        console.error('Content first 500 chars:', contentToParse.substring(0, 500));
        throw new Error(`Output is not valid JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
      
      // Convert output to our format (handles both GeoJSON and frames format)
      const result = convertGeoJSONToFlightLog(parsedOutput, filename);
      
      if (!result.success) {
        console.error('❌ Conversion failed:', result.error);
        console.error('📊 Output structure details:', {
          keys: Object.keys(parsedOutput),
          hasFeatures: !!parsedOutput.features,
          featuresLength: parsedOutput.features?.length || 0,
          hasFrames: !!parsedOutput.frames,
          framesLength: parsedOutput.frames?.length || 0,
          hasVersion: !!parsedOutput.version,
          hasDetails: !!parsedOutput.details,
          outputSize: outputContent.length,
        });
        
        // Include structure info in error for debugging
        const structureInfo = `Structure: ${Object.keys(parsedOutput).join(', ')}. ` +
          (parsedOutput.frames ? `Frames: ${parsedOutput.frames.length}. ` : '') +
          (parsedOutput.features ? `Features: ${parsedOutput.features.length}. ` : '');
        
        return {
          success: false,
          error: `${result.error} ${structureInfo}`,
        };
      }
      
      console.log('✅ Conversion succeeded!');
      return result;
    } catch (cliError: any) {
      // If CLI tool fails, check if it's because tool doesn't exist
      const isNotFoundError = cliError?.code === 'ENOENT' || 
                             (cliError instanceof Error && cliError.message.includes('ENOENT')) ||
                             (cliError?.stderr?.toString().includes('ENOENT'));
      
      if (isNotFoundError) {
        console.warn('❌ dji-log-parser CLI tool not found');
        console.warn(`   Expected path: ${DJI_LOG_PARSER_PATH}`);
        console.warn('   ⚠️  Falling back to basic parser (results will be inaccurate)');
        console.warn('   📥 To install: Download from https://github.com/lvauvillier/dji-log-parser/releases');
        console.warn(`   📁 Place binary at: ${DJI_LOG_PARSER_PATH}`);
        console.warn('   🔧 Or set DJI_LOG_PARSER_PATH environment variable');
        
        // Fallback to basic parser (it will fail with helpful error message)
        return parseWithBasicParser(fileBuffer, filename);
      }
      
      // Log CLI error details
      const errorDetails = {
        message: cliError?.message,
        code: cliError?.code,
        stdout: cliError?.stdout?.toString(),
        stderr: cliError?.stderr?.toString(),
      };
      console.error('CLI tool error:', errorDetails);
      
      // Return the actual CLI error instead of falling back silently
      // This way the user can see what went wrong
      return {
        success: false,
        error: `CLI tool failed: ${cliError?.message || 'Unknown error'}. ${cliError?.stderr?.toString() ? `stderr: ${cliError.stderr.toString()}` : ''} ${cliError?.stdout?.toString() ? `stdout: ${cliError.stdout.toString()}` : ''}. Please check that the dji-log-parser binary is correct and executable.`,
      };
    }
  } catch (error) {
    console.error('Error parsing with CLI:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    // Clean up temp files
    try {
      if (inputFile) await unlink(inputFile).catch(() => {});
      if (outputFile) await unlink(outputFile).catch(() => {});
      if (tempDir) {
        const { rmdir } = await import('fs/promises');
        await rmdir(tempDir).catch(() => {});
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert GeoJSON output from dji-log-parser to our FlightLog format
 * The tool may output GeoJSON or JSON frames format
 */
function convertGeoJSONToFlightLog(geojson: any, filename: string): ParseResult {
  try {
    console.log('Converting output format, structure:', {
      type: geojson.type,
      geometryType: geojson.geometry?.type,
      hasFeatures: !!geojson.features,
      hasFrames: !!geojson.frames,
      hasVersion: !!geojson.version,
      keys: Object.keys(geojson),
    });
    
    // Check if it's GeoJSON FeatureCollection format
    let features: any[] = [];
    
    if (geojson.type === 'FeatureCollection' && geojson.features) {
      console.log('Found GeoJSON FeatureCollection format');
      features = geojson.features || [];
    } else if (geojson.type === 'Feature') {
      // It's a single Feature - wrap it in an array
      console.log(`Found single GeoJSON Feature with geometry type: ${geojson.geometry?.type}`);
      features = [geojson];
    } else if (geojson.features && Array.isArray(geojson.features)) {
      // Already has features array
      features = geojson.features;
    }
    
    // Handle LineString geometry - convert to Point features
    if (features.length === 1) {
      const feature = features[0];
      const geometryType = feature?.geometry?.type;
      console.log(`Single feature found, geometry type: ${geometryType}`);
      
      if (geometryType === 'LineString') {
        console.log('Found LineString GeoJSON, converting to Point features');
        const lineString = feature.geometry.coordinates;
        const properties = feature.properties || {};
        const coordinateCount = lineString.length;
        console.log(`LineString has ${coordinateCount} coordinates`);
        
        if (!Array.isArray(lineString) || lineString.length === 0) {
          console.error('LineString coordinates is not a valid array');
        } else {
          features = lineString.map((coord: number[], index: number) => {
            const lng = coord[0];
            const lat = coord[1];
            const altitude = coord[2] || 0;
            
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lng, lat], // GeoJSON format: [lng, lat]
              },
              properties: {
                ...properties,
                altitude: altitude,
                altitude_agl: altitude,
                index,
                timestamp: index * 100, // Default 100ms intervals if not in properties
                time: index * 100,
              },
            };
          });
          console.log(`✓ Converted LineString to ${features.length} Point features`);
        }
      } else if (geometryType === 'Point') {
        console.log('Feature already is a Point, using as-is');
      } else {
        console.warn(`Unknown geometry type: ${geometryType}, attempting to process anyway`);
      }
    }
    
    // If no features, check if it's frames format (raw JSON)
    if (features.length === 0 && geojson.frames && Array.isArray(geojson.frames)) {
      console.log(`Converting ${geojson.frames.length} frames to GeoJSON format`);
      // Convert frames to GeoJSON features
      features = geojson.frames.map((frame: any, index: number) => {
        const osd = frame.osd || {};
        const lat = osd.latitude;
        const lng = osd.longitude;
        
        if (!lat || !lng) return null;
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat], // GeoJSON is [lng, lat]
          },
          properties: {
            // Try multiple timestamp sources:
            // 1. custom.dateTime (absolute timestamp)
            // 2. flyTime from OSD (relative time in seconds from takeoff)
            // 3. fallback to index (last resort)
            timestamp: frame.custom?.dateTime 
              ? new Date(frame.custom.dateTime).getTime() / 1000 
              : (osd.flyTime !== undefined && osd.flyTime > 0 
                  ? osd.flyTime 
                  : index),
            time: frame.custom?.dateTime 
              ? new Date(frame.custom.dateTime).getTime() / 1000 
              : (osd.flyTime !== undefined && osd.flyTime > 0 
                  ? osd.flyTime 
                  : index),
            // Store flyTime separately for duration calculation
            flyTime: osd.flyTime,
            altitude: osd.altitude || osd.height || 0,
            altitude_agl: osd.height || 0,
            speed: Math.sqrt(
              Math.pow(osd.xSpeed || 0, 2) + 
              Math.pow(osd.ySpeed || 0, 2)
            ),
            velocity: Math.sqrt(
              Math.pow(osd.xSpeed || 0, 2) + 
              Math.pow(osd.ySpeed || 0, 2)
            ),
            battery: frame.battery?.chargeLevel,
            battery_percentage: frame.battery?.chargeLevel,
            heading: osd.yaw,
            gimbal_pitch: frame.gimbal?.pitch,
            ...frame,
          },
        };
      }).filter((f: any) => f !== null);
    }
    
    if (features.length === 0) {
      console.error('No features or frames found in output:', {
        geojsonKeys: Object.keys(geojson),
        hasFeatures: !!geojson.features,
        featuresLength: geojson.features?.length || 0,
        hasFrames: !!geojson.frames,
        framesLength: geojson.frames?.length || 0,
        sample: JSON.stringify(geojson).substring(0, 1000),
      });
      
      // Check if frames array exists but is empty or has no GPS data
      if (geojson.frames && Array.isArray(geojson.frames)) {
        const framesWithGPS = geojson.frames.filter((f: any) => f.osd?.latitude && f.osd?.longitude);
        console.error(`Found ${geojson.frames.length} frames, but only ${framesWithGPS.length} have GPS coordinates`);
        
        if (framesWithGPS.length === 0) {
          return {
            success: false,
            error: 'No GPS coordinates found in log file frames. The flight may not have had GPS lock.',
          };
        }
        
        // Retry with frames that have GPS
        console.log('Retrying conversion with frames that have GPS coordinates...');
        features = framesWithGPS.map((frame: any, index: number) => {
          const osd = frame.osd || {};
          const lat = osd.latitude;
          const lng = osd.longitude;
          
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            properties: {
              // Try multiple timestamp sources (same as main conversion)
              timestamp: frame.custom?.dateTime 
                ? new Date(frame.custom.dateTime).getTime() / 1000 
                : (osd.flyTime !== undefined && osd.flyTime > 0 
                    ? osd.flyTime 
                    : index),
              time: frame.custom?.dateTime 
                ? new Date(frame.custom.dateTime).getTime() / 1000 
                : (osd.flyTime !== undefined && osd.flyTime > 0 
                    ? osd.flyTime 
                    : index),
              // Store flyTime separately for duration calculation
              flyTime: osd.flyTime,
              altitude: osd.altitude || osd.height || 0,
              altitude_agl: osd.height || 0,
              speed: Math.sqrt(
                Math.pow(osd.xSpeed || 0, 2) + 
                Math.pow(osd.ySpeed || 0, 2)
              ),
              velocity: Math.sqrt(
                Math.pow(osd.xSpeed || 0, 2) + 
                Math.pow(osd.ySpeed || 0, 2)
              ),
              battery: frame.battery?.chargeLevel,
              battery_percentage: frame.battery?.chargeLevel,
              heading: osd.yaw,
              gimbal_pitch: frame.gimbal?.pitch,
              ...frame,
            },
          };
        });
      }
      
      if (features.length === 0) {
        // Build a detailed error message
        const errorDetails: string[] = [];
        errorDetails.push('No flight data found in log file.');
        errorDetails.push(`Output structure: ${JSON.stringify(Object.keys(geojson))}`);
        
        if (geojson.frames && Array.isArray(geojson.frames)) {
          const framesWithGPS = geojson.frames.filter((f: any) => f.osd?.latitude && f.osd?.longitude);
          errorDetails.push(`Found ${geojson.frames.length} frames, but ${framesWithGPS.length} have GPS coordinates.`);
          if (framesWithGPS.length === 0) {
            errorDetails.push('None of the frames contain GPS data - the flight may not have had GPS lock.');
          }
        } else {
          errorDetails.push('No frames array found in output.');
        }
        
        return {
          success: false,
          error: errorDetails.join(' '),
        };
      }
    }
    
    console.log(`Processing ${features.length} data points`);

    // Extract photo locations from momentPic arrays if present (LineString format)
    const momentPicPhotos: Array<{lat: number, lng: number}> = [];
    if (features.length > 0 && features[0]?.properties) {
      const firstProps = features[0].properties;
      const momentPicLat = firstProps.momentPicLatitude;
      const momentPicLng = firstProps.momentPicLongitude;
      
      if (Array.isArray(momentPicLat) && Array.isArray(momentPicLng) && momentPicLat.length > 0) {
        console.log(`Found momentPic arrays with ${momentPicLat.length} photo locations`);
        for (let i = 0; i < Math.min(momentPicLat.length, momentPicLng.length); i++) {
          const lat = momentPicLat[i];
          const lng = momentPicLng[i];
          if (lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng)) {
            momentPicPhotos.push({ lat, lng });
          }
        }
        console.log(`Extracted ${momentPicPhotos.length} valid photo locations from momentPic arrays`);
      }
    }

    const dataPoints: FlightLogDataPoint[] = [];
    let flightDate: Date | undefined;
    let filenameDate: Date | undefined;
    let homeLat: number | undefined;
    let homeLng: number | undefined;
    let maxAltitudeM = -Infinity;
    let maxSpeedMps = -Infinity;
    let totalDistanceM = 0;
    let maxDistanceM = 0;
    let minBattery = Infinity;
    let maxBattery = -Infinity;
    let firstBattery: number | undefined = undefined;
    let lastBattery: number | undefined = undefined;
    let lastPhotoNum: number | null = null; // Track photo count changes to detect photos (null = not yet initialized)
    let lastDetectedPhotoNum: number | null = null; // Track which photoNum we last detected a photo for (to avoid duplicates)
    let firstTimestamp: number | null = null; // Track first timestamp to calculate offsets
    let batterySerialNumber: string | undefined = undefined; // Battery serial number from recover object
    let droneSerialNumber: string | undefined = undefined; // Drone serial number from recover object
    let droneModel: string | undefined = undefined; // Drone model from recover object
    
    // Track warnings and errors
    const warnings: Array<{
      severity: 'warning' | 'error';
      category: string;
      message: string;
      timestampOffsetMs: number;
      details?: Record<string, unknown>;
    }> = [];
    const errors: Array<{
      severity: 'warning' | 'error';
      category: string;
      message: string;
      timestampOffsetMs: number;
      details?: Record<string, unknown>;
    }> = [];
    const seenIssues = new Map<string, number>(); // Track unique issues to avoid duplicates (key -> last timestamp)
    
    console.log(`Starting photo detection with lastPhotoNum: ${lastPhotoNum}`);
    
    // Try to extract flight date from filename upfront
    const filenameDateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})_\[(\d{2})-(\d{2})-(\d{2})\]/);
    if (filenameDateMatch) {
      const [, year, month, day, hour, minute, second] = filenameDateMatch.map(Number);
      filenameDate = new Date(year, month - 1, day, hour, minute, second);
    }

    // Extract data points from GeoJSON features
    for (const feature of features) {
      if (feature.geometry?.type === 'Point' && feature.properties) {
        const props = feature.properties;
        const coords = feature.geometry.coordinates; // [lng, lat]

        // Extract timestamp - handle both seconds (float) and milliseconds (integer)
        let timestamp: number = 0;
        const rawTimestamp = props.timestamp || props.time || 0;
        if (rawTimestamp) {
          // If timestamp is in seconds (has decimal or is small number), convert to milliseconds
          if (rawTimestamp < 10000000000) {
            // Likely in seconds (Unix timestamp before 2001 or relative time)
            timestamp = Math.round(rawTimestamp * 1000);
          } else if (rawTimestamp < 1000000000000) {
            // Likely in milliseconds (Unix timestamp)
            timestamp = Math.round(rawTimestamp);
          } else {
            // Already in milliseconds (microseconds or very large)
            timestamp = Math.round(rawTimestamp / 1000);
          }
        }
        const lat = coords[1];
        const lng = coords[0];
        const altitude = props.altitude || props.altitude_agl || 0;
        const speed = props.speed || props.velocity || 0;
        
        // Extract battery percentage - handle both numeric and object formats
        let battery: number | undefined;
        if (props.battery !== undefined) {
          if (typeof props.battery === 'number') {
            battery = props.battery;
          } else if (props.battery && typeof props.battery === 'object' && 'chargeLevel' in props.battery) {
            battery = (props.battery as any).chargeLevel;
          }
        }
        if (battery === undefined && props.battery_percentage !== undefined) {
          battery = typeof props.battery_percentage === 'number' 
            ? props.battery_percentage 
            : undefined;
        }

        // Set firstTimestamp as early as possible (from first point with any valid timestamp)
        // This is critical for calculating duration correctly
        if (firstTimestamp === null && timestamp > 0) {
          firstTimestamp = timestamp;
          // Extract flight date from first timestamp (assuming milliseconds)
          try {
            const timestampDate = new Date(timestamp);
            const year = timestampDate.getUTCFullYear();
            // Only trust timestamp-based date if it falls within reasonable range
            if (!isNaN(timestampDate.getTime()) && year >= 2010 && year <= 2035) {
              flightDate = timestampDate;
            } else {
              console.warn('Ignoring unrealistic timestamp-based flight date:', timestampDate.toISOString(), 'from timestamp:', timestamp);
            }
          } catch (e) {
            console.warn('Failed to parse flight date from timestamp:', timestamp);
          }
        }
        
        // Set home position from first point with GPS
        if (!homeLat && !homeLng && lat && lng) {
          homeLat = lat;
          homeLng = lng;
        }

        // Track max values
        if (altitude > maxAltitudeM) maxAltitudeM = altitude;
        if (speed > maxSpeedMps) maxSpeedMps = speed;
        if (battery !== undefined) {
          // Track first and last battery readings (actual start/end)
          if (firstBattery === undefined) {
            firstBattery = battery;
          }
          lastBattery = battery;
          
          // Also track min/max for statistics
          if (battery < minBattery) minBattery = battery;
          if (battery > maxBattery) maxBattery = battery;
        }

        // Calculate distance from home
        if (lat && lng && homeLat && homeLng) {
          const distance = haversineDistance(homeLat, homeLng, lat, lng);
          if (distance > maxDistanceM) maxDistanceM = distance;
        }

        // Calculate cumulative distance
        if (dataPoints.length > 0 && lat && lng) {
          const lastPoint = dataPoints[dataPoints.length - 1];
          if (lastPoint.lat && lastPoint.lng) {
            totalDistanceM += haversineDistance(lastPoint.lat, lastPoint.lng, lat, lng);
          }
        }

        // Extract photo information from frame data
        // The frame structure should have camera data at props.camera (from ...frame spread)
        // or might be nested differently. Check multiple possible locations.
        const camera = props.camera || {};
        const custom = props.custom || {};
        const osd = props.osd || {};
        const gimbal = props.gimbal || {};
        const recover = props.recover || {};
        
        // Extract battery serial number from recover object (if available)
        if (!batterySerialNumber && recover.batterySn) {
          batterySerialNumber = recover.batterySn as string;
        }
        // Also check alternative field names
        if (!batterySerialNumber && recover.batterySerialNumber) {
          batterySerialNumber = recover.batterySerialNumber as string;
        }
        if (!batterySerialNumber && recover.batterySerial) {
          batterySerialNumber = recover.batterySerial as string;
        }
        
        // Extract drone serial number from recover object (if available)
        if (!droneSerialNumber && recover.aircraftSn) {
          droneSerialNumber = recover.aircraftSn as string;
        }
        if (!droneSerialNumber && recover.aircraftSN) {
          droneSerialNumber = recover.aircraftSN as string;
        }
        if (!droneSerialNumber && recover.aircraftSerialNumber) {
          droneSerialNumber = recover.aircraftSerialNumber as string;
        }
        
        // Extract drone model from recover object (if available)
        if (!droneModel && recover.aircraftName) {
          droneModel = recover.aircraftName as string;
        }
        if (!droneModel && recover.aircraftModel) {
          droneModel = recover.aircraftModel as string;
        }
        
        // Check photo count from multiple sources (prioritize frame-level data over summary):
        // - camera.photoNum (frame-level, most accurate for timing)
        // - osd.photoNum (frame-level OSD data)
        // - props.photoNum (if frame was spread directly)
        // - recover.photoNum (from log summary - cumulative total, less accurate for per-frame detection)
        const currentPhotoNum = camera.photoNum ?? osd.photoNum ?? props.photoNum ?? recover.photoNum ?? null;
        
        // Check for photo indicators in multiple locations (most reliable):
        // - frame.camera.isPhoto (boolean) - most reliable
        // - frame.camera.is_photo (alternative naming)
        // - props.isPhoto (if frame was spread directly)
        const isPhotoFromFlag = camera.isPhoto === true || 
                                camera.is_photo === true ||
                                props.isPhoto === true ||
                                props.is_photo === true;
        
        // Photo count increased check (fallback only when isPhoto flag is not available):
        // Only use this if camera.isPhoto flag is not present, and only detect once per photoNum value
        // to avoid duplicate detections when photoNum stays constant across multiple frames
        const photoCountIncreased = !isPhotoFromFlag && // Only use as fallback
                                    lastPhotoNum !== null && 
                                    currentPhotoNum !== null && 
                                    typeof currentPhotoNum === 'number' &&
                                    typeof lastPhotoNum === 'number' &&
                                    currentPhotoNum > lastPhotoNum &&
                                    currentPhotoNum !== lastDetectedPhotoNum; // Only detect once per photoNum value
        
        // Disable photo creation during initial upload - photos will be created from actual files via photo processing
        const isPhoto = false; // Always false - photos are processed separately from actual files
        
        // Debug: Log first few frames with camera data and any photo detections
        if (dataPoints.length < 5) {
          console.log(`Frame ${dataPoints.length} photo check:`, {
            camera: Object.keys(camera).length > 0 ? camera : 'empty',
            isPhotoFromFlag,
            photoCountIncreased,
            currentPhotoNum,
            lastPhotoNum,
            isPhoto,
            hasCamera: !!props.camera,
            hasOsd: !!props.osd,
            hasRecover: !!props.recover,
          });
        }
        
        // Update last photo count (only if we have a valid number)
        if (currentPhotoNum !== null && typeof currentPhotoNum === 'number') {
          lastPhotoNum = currentPhotoNum;
        }
        
        // Track which photoNum we detected a photo for (to avoid duplicates)
        if (isPhoto && currentPhotoNum !== null && typeof currentPhotoNum === 'number') {
          lastDetectedPhotoNum = currentPhotoNum;
        }
        
        // Extract photo filename if available
        // DJI logs may store photo filenames in various places:
        let photoFilename: string | undefined;
        if (isPhoto) {
          // Try multiple possible locations for filename
          photoFilename = 
            camera?.photoFileName || 
            camera?.photo_filename ||
            camera?.fileName || 
            camera?.file_name ||
            camera?.file_name_base ||
            camera?.fileIndex ||
            props?.photoFileName || 
            props?.photo_filename ||
            props?.fileName ||
            props?.file_name ||
            props?.file_name_base ||
            custom?.photoFileName ||
            custom?.fileName ||
            custom?.file_name ||
            undefined;
          
          // If no filename found, try to construct one from available data
          // DJI photos follow pattern: DJI_YYYYMMDDHHMMSS_####_D.DNG (or .JPG)
          if (!photoFilename) {
            // Count how many photos we've seen so far as a fallback for photo number
            const photoIndex = dataPoints.filter(dp => dp.isPhoto).length + 1;
            const photoNum = currentPhotoNum !== null 
              ? currentPhotoNum.toString().padStart(4, '0')
              : photoIndex.toString().padStart(4, '0');
            
            // Extract date from timestamp if available
            if (timestamp && firstTimestamp !== null) {
              try {
                const photoDate = new Date(timestamp);
                const year = photoDate.getFullYear();
                const month = String(photoDate.getMonth() + 1).padStart(2, '0');
                const day = String(photoDate.getDate()).padStart(2, '0');
                const hours = String(photoDate.getHours()).padStart(2, '0');
                const minutes = String(photoDate.getMinutes()).padStart(2, '0');
                const seconds = String(photoDate.getSeconds()).padStart(2, '0');
                // Format: DJI_YYYYMMDDHHMMSS_####_D.DNG (no underscores in date/time)
                photoFilename = `DJI_${year}${month}${day}${hours}${minutes}${seconds}_${photoNum}_D.DNG`;
              } catch (e) {
                // If date parsing fails, just use photo number
                photoFilename = `DJI_PHOTO_${photoNum}_D.DNG`;
              }
            } else if (timestamp) {
              // If we have timestamp but no firstTimestamp, try using timestamp directly
              try {
                const photoDate = new Date(timestamp);
                const year = photoDate.getFullYear();
                const month = String(photoDate.getMonth() + 1).padStart(2, '0');
                const day = String(photoDate.getDate()).padStart(2, '0');
                const hours = String(photoDate.getHours()).padStart(2, '0');
                const minutes = String(photoDate.getMinutes()).padStart(2, '0');
                const seconds = String(photoDate.getSeconds()).padStart(2, '0');
                // Format: DJI_YYYYMMDDHHMMSS_####_D.DNG (no underscores in date/time)
                photoFilename = `DJI_${year}${month}${day}${hours}${minutes}${seconds}_${photoNum}_D.DNG`;
              } catch (e) {
                photoFilename = `DJI_PHOTO_${photoNum}_D.DNG`;
              }
            } else {
              // Fallback: just use photo number/index
              photoFilename = `DJI_PHOTO_${photoNum}_D.DNG`;
            }
          }
          
          // Debug: Log first few photos to see what data is available
          if (dataPoints.filter(dp => dp.isPhoto).length < 3) {
            console.log('Photo detected - filename extraction:', {
              photoNum: currentPhotoNum,
              foundFilename: !!photoFilename && photoFilename.startsWith('DJI_'),
              constructedFilename: photoFilename,
              cameraKeys: camera ? Object.keys(camera) : [],
              hasRecover: !!recover,
            });
          }
        }

        // Calculate offset from first timestamp (in milliseconds, as integer)
        // PostgreSQL INTEGER max is 2,147,483,647 (about 24 days in milliseconds)
        let timestampOffsetMs: number;
        if (timestamp > 0 && firstTimestamp !== null) {
          // Calculate offset from start of flight
          timestampOffsetMs = Math.round(timestamp - firstTimestamp);
          // Ensure it fits in INTEGER range and is non-negative
          if (timestampOffsetMs < 0) timestampOffsetMs = 0;
          if (timestampOffsetMs > 2147483647) timestampOffsetMs = 2147483647; // Max INTEGER value
        } else if (timestamp > 0) {
          // First point - offset is 0, and we need to set firstTimestamp
          timestampOffsetMs = 0;
          if (firstTimestamp === null) {
            firstTimestamp = timestamp;
            // Extract flight date from first timestamp if not already set
            if (!flightDate) {
              try {
                flightDate = new Date(timestamp);
              } catch (e) {
                console.warn('Failed to parse flight date from timestamp:', timestamp);
              }
            }
          }
        } else {
          // Fallback: use index-based offset
          timestampOffsetMs = dataPoints.length * 100;
        }
        
        // Extract battery health information
        const batteryData = props.battery || {};
        const batteryHealth = typeof batteryData === 'object' && batteryData !== null && !Array.isArray(batteryData)
          ? {
              voltage: batteryData.voltage as number | undefined,
              current: batteryData.current as number | undefined,
              temperature: batteryData.temperature as number | undefined,
              minTemperature: batteryData.minTemperature as number | undefined,
              maxTemperature: batteryData.maxTemperature as number | undefined,
              cellVoltages: Array.isArray(batteryData.cellVoltages) ? batteryData.cellVoltages as number[] : undefined,
              cellVoltageDeviation: batteryData.cellVoltageDeviation as number | undefined,
              currentCapacity: batteryData.currentCapacity as number | undefined,
              fullCapacity: batteryData.fullCapacity as number | undefined,
            }
          : {};
        
        dataPoints.push({
          timestampOffsetMs: timestampOffsetMs,
          lat,
          lng,
          altitudeM: altitude > 0 ? altitude : undefined,
          speedMps: speed > 0 ? speed : undefined,
          batteryPercent: battery !== undefined ? battery : undefined,
          batteryVoltage: batteryHealth.voltage,
          batteryCurrent: batteryHealth.current,
          batteryTemperature: batteryHealth.temperature,
          batteryMinTemperature: batteryHealth.minTemperature,
          batteryMaxTemperature: batteryHealth.maxTemperature,
          batteryCellVoltages: batteryHealth.cellVoltages,
          batteryCellVoltageDeviation: batteryHealth.cellVoltageDeviation,
          batteryCurrentCapacity: batteryHealth.currentCapacity,
          batteryFullCapacity: batteryHealth.fullCapacity,
          headingDeg: props.heading || props.yaw || undefined,
          gimbalPitchDeg: props.gimbal_pitch || props.gimbal?.pitch || undefined,
          satelliteCount: props.satellites || props.gpsNum || props.osd?.gpsNum || undefined,
          isPhoto,
          photoFilename,
          isVideoRecording: camera.isVideo === true || props.isVideo === true || false,
          rawData: props, // Store full frame data for debugging and future extraction
        });
        
        // Detect warnings and errors from OSD and other frame data
        // Only log each unique issue once per 10 seconds to avoid spam
        const issueCheckInterval = 10000; // 10 seconds in ms
        
        // Extract RC for signal detection (osd, camera, gimbal already extracted above)
        const rc = props.rc || {};
        
        // Battery warnings
        if (battery !== undefined) {
          if (battery < 20 && battery >= 10) {
            const issueKey = `battery-low-${Math.floor(battery / 5) * 5}`;
            const lastSeen = seenIssues.get(issueKey) || 0;
            if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
              warnings.push({
                severity: 'warning',
                category: 'battery',
                message: `Low battery: ${Math.round(battery)}%`,
                timestampOffsetMs,
                details: { batteryPercent: battery },
              });
              seenIssues.set(issueKey, timestampOffsetMs);
            }
          } else if (battery < 10) {
            const issueKey = `battery-critical-${Math.floor(battery / 2) * 2}`;
            const lastSeen = seenIssues.get(issueKey) || 0;
            if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
              errors.push({
                severity: 'error',
                category: 'battery',
                message: `Critical battery level: ${Math.round(battery)}%`,
                timestampOffsetMs,
                details: { batteryPercent: battery },
              });
              seenIssues.set(issueKey, timestampOffsetMs);
            }
          }
        }
        
        // Battery voltage warning
        if (osd.voltageWarning !== undefined && osd.voltageWarning > 0) {
          const issueKey = 'voltage-warning';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            warnings.push({
              severity: 'warning',
              category: 'battery',
              message: `Battery voltage warning (level ${osd.voltageWarning})`,
              timestampOffsetMs,
              details: { voltageWarning: osd.voltageWarning },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // Gimbal errors
        if (gimbal.isStuck === true) {
          const issueKey = 'gimbal-stuck';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'gimbal',
              message: 'Gimbal stuck',
              timestampOffsetMs,
              details: { isStuck: true },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // Signal loss
        if (rc.downlinkSignal === null || rc.downlinkSignal === 0) {
          const issueKey = 'signal-downlink-lost';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            warnings.push({
              severity: 'warning',
              category: 'signal',
              message: 'Downlink signal lost',
              timestampOffsetMs,
              details: { downlinkSignal: rc.downlinkSignal },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        if (rc.uplinkSignal === null || rc.uplinkSignal === 0) {
          const issueKey = 'signal-uplink-lost';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            warnings.push({
              severity: 'warning',
              category: 'signal',
              message: 'Uplink signal lost',
              timestampOffsetMs,
              details: { uplinkSignal: rc.uplinkSignal },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // Compass error
        if (osd.isCompassError === true) {
          const issueKey = 'compass-error';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'compass',
              message: 'Compass error detected',
              timestampOffsetMs,
              details: { isCompassError: true },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // IMU errors
        if (osd.imuInitFailReason && osd.imuInitFailReason !== 'None' && osd.imuInitFailReason !== 'MonitorError') {
          const issueKey = `imu-error-${osd.imuInitFailReason}`;
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'imu',
              message: `IMU initialization failed: ${osd.imuInitFailReason}`,
              timestampOffsetMs,
              details: { imuInitFailReason: osd.imuInitFailReason },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // Motor issues
        if (osd.isMotorBlocked === true) {
          const issueKey = 'motor-blocked';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'motor',
              message: 'Motor blocked',
              timestampOffsetMs,
              details: { isMotorBlocked: true },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        if (osd.motorStartFailedCause && osd.motorStartFailedCause !== 'None') {
          const issueKey = `motor-start-failed-${osd.motorStartFailedCause}`;
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'motor',
              message: `Motor start failed: ${osd.motorStartFailedCause}`,
              timestampOffsetMs,
              details: { motorStartFailedCause: osd.motorStartFailedCause },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // GPS issues
        const gpsNum = osd.gpsNum || props.gpsNum || props.satellites || 0;
        if (gpsNum > 0 && gpsNum < 6) {
          const issueKey = `gps-low-${Math.floor(gpsNum / 2) * 2}`;
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            warnings.push({
              severity: 'warning',
              category: 'gps',
              message: `Low GPS satellite count: ${gpsNum}`,
              timestampOffsetMs,
              details: { gpsNum, gpsLevel: osd.gpsLevel },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
        
        // Barometer issues
        if (osd.isBarometerDeadInAir === true) {
          const issueKey = 'barometer-dead';
          const lastSeen = seenIssues.get(issueKey) || 0;
          if (timestampOffsetMs - lastSeen >= issueCheckInterval) {
            errors.push({
              severity: 'error',
              category: 'barometer',
              message: 'Barometer dead in air',
              timestampOffsetMs,
              details: { isBarometerDeadInAir: true },
            });
            seenIssues.set(issueKey, timestampOffsetMs);
          }
        }
      }
    }

    // Match momentPic photo locations to nearest data points
    if (momentPicPhotos.length > 0 && dataPoints.length > 0) {
      console.log(`Matching ${momentPicPhotos.length} momentPic photos to data points...`);
      for (const photoLoc of momentPicPhotos) {
        // Find the nearest data point to this photo location
        let nearestPoint: FlightLogDataPoint | null = null;
        let minDistance = Infinity;
        
        for (const dp of dataPoints) {
          if (dp.lat !== undefined && dp.lng !== undefined) {
            const distance = haversineDistance(photoLoc.lat, photoLoc.lng, dp.lat, dp.lng);
            if (distance < minDistance) {
              minDistance = distance;
              nearestPoint = dp;
            }
          }
        }
        
        // Mark the nearest point as a photo if it's within 100 meters
        // Only mark if it's not already marked as a photo (avoid duplicates)
        if (nearestPoint && minDistance < 100) {
          if (!nearestPoint.isPhoto) {
            // Don't mark as photo - photos will be processed separately from actual files
            // nearestPoint.isPhoto = true;
            console.log(`Matched momentPic photo at ${photoLoc.lat.toFixed(6)}, ${photoLoc.lng.toFixed(6)} to data point (distance: ${minDistance.toFixed(1)}m)`);
          } else {
            console.log(`Skipping duplicate: momentPic photo at ${photoLoc.lat.toFixed(6)}, ${photoLoc.lng.toFixed(6)} already detected via frame data`);
          }
        } else if (nearestPoint) {
          console.warn(`Photo location too far from nearest point: ${minDistance.toFixed(1)}m`);
        }
      }
    }
    
    // Log photo detection summary
    const photoCount = dataPoints.filter(dp => dp.isPhoto === true).length;
    const photosWithGPS = dataPoints.filter(dp => 
      dp.isPhoto === true && 
      dp.lat !== undefined && dp.lng !== undefined && 
      !isNaN(dp.lat!) && !isNaN(dp.lng!) &&
      dp.lat! !== 0 && dp.lng! !== 0
    );
    const photosWithoutGPS = dataPoints.filter(dp => 
      dp.isPhoto === true && 
      !(dp.lat !== undefined && dp.lng !== undefined && 
        !isNaN(dp.lat!) && !isNaN(dp.lng!) &&
        dp.lat! !== 0 && dp.lng! !== 0)
    );
    
    console.log(`Photo detection complete: Found ${photoCount} photos out of ${dataPoints.length} data points`);
    console.log(`  - ${photosWithGPS.length} photos have valid GPS coordinates`);
    if (photosWithoutGPS.length > 0) {
      console.warn(`  - ${photosWithoutGPS.length} photos are missing GPS coordinates:`, 
        photosWithoutGPS.slice(0, 5).map(dp => ({
          timestamp: dp.timestampOffsetMs,
          lat: dp.lat,
          lng: dp.lng,
        }))
      );
    }
    
    if (photoCount > 0) {
      console.log(`Sample photo data points:`, photosWithGPS.slice(0, 3).map(dp => ({
        timestamp: dp.timestampOffsetMs,
        lat: dp.lat,
        lng: dp.lng,
        filename: dp.photoFilename,
      })));
    }
    
    // Calculate duration from timestamps or flyTime
    // Try multiple methods:
    // 1. Use flyTime from OSD if available (most reliable)
    // 2. Calculate from timestamp offsets
    let durationSeconds: number | undefined;
    
    // Method 1: Try to get max flyTime from raw data (most accurate for DJI logs)
    let maxFlyTime: number | undefined;
    for (const dp of dataPoints) {
      if (dp.rawData) {
        const flyTime = dp.rawData.flyTime || dp.rawData.osd?.flyTime;
        if (typeof flyTime === 'number' && flyTime > 0) {
          if (maxFlyTime === undefined || flyTime > maxFlyTime) {
            maxFlyTime = flyTime;
          }
        }
      }
    }
    
    if (maxFlyTime !== undefined && maxFlyTime > 0) {
      // Use flyTime directly (already in seconds)
      durationSeconds = maxFlyTime;
      console.log(`Duration from flyTime: ${durationSeconds}s (from ${dataPoints.length} data points)`);
    } else if (dataPoints.length > 1) {
      // Method 2: Calculate from timestamp offsets
      const sortedPoints = [...dataPoints].sort((a, b) => a.timestampOffsetMs - b.timestampOffsetMs);
      const firstTimestamp = sortedPoints[0].timestampOffsetMs || 0;
      const lastTimestamp = sortedPoints[sortedPoints.length - 1].timestampOffsetMs || 0;
      
      // Duration is the difference between last and first (or just last if first is 0)
      durationSeconds = (lastTimestamp - firstTimestamp) / 1000;
      
      // Log for debugging
      console.log(`Duration calculation from timestamps: ${dataPoints.length} points, first=${firstTimestamp}ms, last=${lastTimestamp}ms, duration=${durationSeconds}s`);
      
      // If duration seems wrong (very small for many points), log more details
      if (durationSeconds < 1 && dataPoints.length > 10) {
        console.warn('Warning: Duration seems too small for number of data points', {
          dataPoints: dataPoints.length,
          firstTimestamp,
          lastTimestamp,
          durationSeconds,
          firstPointOffset: sortedPoints[0].timestampOffsetMs,
          lastPointOffset: sortedPoints[sortedPoints.length - 1].timestampOffsetMs,
        });
      }
    } else if (dataPoints.length === 1) {
      // Single data point means zero duration
      durationSeconds = 0;
    }

    // Validate / fallback flight date using filename if necessary
    const isFlightDateValid = flightDate && !isNaN(flightDate.getTime()) && flightDate.getUTCFullYear() >= 2010 && flightDate.getUTCFullYear() <= 2035;
    if ((!flightDate || !isFlightDateValid) && filenameDate) {
      console.warn('Using filename-derived date for flight log due to missing or invalid timestamp date', {
        previousDate: flightDate?.toISOString(),
        filenameDate: filenameDate.toISOString(),
      });
      flightDate = filenameDate;
    }

    const flightLog: Partial<FlightLog> = {
      filename,
      flightDate: flightDate?.toISOString(),
      droneModel: droneModel || 'DJI Air 3',
      durationSeconds: durationSeconds !== undefined && durationSeconds > 0 ? durationSeconds : undefined,
      maxAltitudeM: maxAltitudeM !== -Infinity && maxAltitudeM > 0 ? maxAltitudeM : undefined,
      maxSpeedMps: maxSpeedMps !== -Infinity && maxSpeedMps > 0 ? maxSpeedMps : undefined,
      maxDistanceM: maxDistanceM > 0 ? maxDistanceM : undefined,
      totalDistanceM: totalDistanceM > 0 ? totalDistanceM : undefined,
      homeLocation: homeLat && homeLng ? { lat: homeLat, lng: homeLng } : undefined,
      startLocation: dataPoints.length > 0 && dataPoints[0].lat && dataPoints[0].lng
        ? { lat: dataPoints[0].lat, lng: dataPoints[0].lng }
        : undefined,
      endLocation: dataPoints.length > 0 && 
        dataPoints[dataPoints.length - 1].lat && 
        dataPoints[dataPoints.length - 1].lng
        ? { 
            lat: dataPoints[dataPoints.length - 1].lat, 
            lng: dataPoints[dataPoints.length - 1].lng 
          }
        : undefined,
      batteryStartPercent: firstBattery !== undefined && firstBattery >= 0 ? firstBattery : undefined,
      batteryEndPercent: lastBattery !== undefined && lastBattery >= 0 ? lastBattery : undefined,
      dataPoints,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        parser: 'dji-log-parser-cli',
        dataPointCount: dataPoints.length,
        batterySerialNumber: batterySerialNumber || undefined,
        droneSerialNumber: droneSerialNumber || undefined,
        droneModel: droneModel || undefined,
      },
    };

    return {
      success: true,
      flightLog,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert GeoJSON',
    };
  }
}

/**
 * Fallback parser when CLI tool is not available
 * Creates a File object from Buffer for Node.js environment
 */
async function parseWithBasicParser(
  fileBuffer: Buffer,
  filename: string
): Promise<ParseResult> {
  try {
    console.log('Using basic heuristic parser (CLI tool not available)');
    console.log(`File size: ${fileBuffer.length} bytes`);
    
    // Import the basic parser as fallback
    const { parseDJILogFile } = await import('./dji-log-parser');
    
    // Create a File object - File API is available in Node.js 18+
    // Convert Buffer to Uint8Array for File constructor
    const uint8Array = new Uint8Array(fileBuffer);
    const file = new File([uint8Array], filename, { 
      type: 'application/octet-stream',
      lastModified: Date.now(),
    });
    
    console.log('Calling parseDJILogFile...');
    const result = await parseDJILogFile(file);
    
    console.log('Parser result:', {
      dataPointsCount: result.dataPoints?.length || 0,
      hasFlightLog: !!result.flightLog,
      flightLogKeys: result.flightLog ? Object.keys(result.flightLog) : [],
    });
    
    // Validate results - basic parser should extract many data points for a real flight
    // If we only get 1 or very few points, it's likely false positives from XOR scrambling
    const MIN_VALID_DATA_POINTS = 10; // A real flight should have many more data points
    
    if (!result.dataPoints || result.dataPoints.length === 0) {
      console.warn('No data points extracted by basic parser');
      return {
        success: false,
        error: 'No flight data found in log file. The dji-log-parser CLI tool is required for accurate parsing of DJI\'s XOR-scrambled log format. Please download and install it from https://github.com/lvauvillier/dji-log-parser/releases',
      };
    }
    
    if (result.dataPoints.length < MIN_VALID_DATA_POINTS) {
      console.warn(`Only ${result.dataPoints.length} data points extracted - likely false positives from XOR scrambling`);
      return {
        success: false,
        error: `Only ${result.dataPoints.length} data point(s) extracted (expected many more for a real flight). The basic parser cannot accurately parse DJI's XOR-scrambled log format. The dji-log-parser CLI tool is required. Download it from https://github.com/lvauvillier/dji-log-parser/releases and place it in the project root as 'dji-log-parser'`,
      };
    }
    
    // Check if coordinates seem reasonable (not in the middle of the ocean or obviously wrong)
    const firstPoint = result.dataPoints[0];
    if (firstPoint.lat && firstPoint.lng) {
      // Check if coordinates are in a reasonable range
      // Most flights won't be at extreme latitudes or in the middle of oceans
      // This is a heuristic check - coordinates around -54, -56 are in the South Atlantic
      const absLat = Math.abs(firstPoint.lat);
      const absLng = Math.abs(firstPoint.lng);
      
      // If coordinates seem suspiciously in an unusual location, warn
      // (This is a simple check - Western Australia would be around -30 to -35 lat, 115-130 lng)
      if (absLat > 50 || (absLng > 60 && absLng < 120)) {
        console.warn('Extracted coordinates may be incorrect due to XOR scrambling');
        return {
          success: false,
          error: `GPS coordinates extracted (${firstPoint.lat.toFixed(6)}, ${firstPoint.lng.toFixed(6)}) appear incorrect. The basic parser cannot accurately parse DJI's XOR-scrambled log format. The dji-log-parser CLI tool is required for accurate GPS coordinates. Download it from https://github.com/lvauvillier/dji-log-parser/releases`,
        };
      }
    }
    
    return {
      success: true,
      flightLog: {
        ...result.flightLog,
        dataPoints: result.dataPoints,
        metadata: {
          ...result.flightLog.metadata,
          parser: 'basic-heuristic',
          note: 'CLI tool not available - using basic parser. Results may be inaccurate.',
          warning: 'Basic parser may produce incorrect GPS coordinates due to XOR scrambling in DJI log format.',
        },
      },
    };
  } catch (error) {
    console.error('Basic parser error:', error);
    const errorDetails = error instanceof Error 
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : { message: String(error) };
    
    console.error('Error details:', errorDetails);
    
    return {
      success: false,
      error: error instanceof Error 
        ? `Failed to parse with basic parser: ${error.message}` 
        : 'Failed to parse with basic parser',
    };
  }
}

/**
 * Calculate haversine distance between two GPS points in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

