import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdtemp, access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

/**
 * Path to dcraw CLI tool
 * Set this via environment variable DCRAW_PATH
 * or it will look for 'dcraw' in PATH
 * 
 * Note: Next.js API routes may not inherit shell PATH, so we check common locations
 */
const DCRAW_PATH = process.env.DCRAW_PATH || 'dcraw';

// Helper to get PATH with common Homebrew locations for Apple Silicon Macs
function getExtendedPath(): string {
  const currentPath = process.env.PATH || '';
  const homebrewPath = '/opt/homebrew/bin';
  const homebrewLocalPath = '/usr/local/bin';
  
  // Add Homebrew paths if not already present
  let extendedPath = currentPath;
  if (!extendedPath.includes(homebrewPath)) {
    extendedPath = `${homebrewPath}:${extendedPath}`;
  }
  if (!extendedPath.includes(homebrewLocalPath)) {
    extendedPath = `${homebrewLocalPath}:${extendedPath}`;
  }
  
  return extendedPath;
}

/**
 * Convert DNG to full-resolution TIFF using dcraw
 * Returns a buffer of the decoded TIFF image
 */
export async function decodeDNGWithDCRAW(
  dngBuffer: Buffer,
  filename: string
): Promise<Buffer> {
  let tempDir: string | null = null;
  let inputFile: string | null = null;

  try {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), 'dng-decode-'));
    inputFile = join(tempDir, filename);

    // Write DNG file to temp directory
    await writeFile(inputFile, dngBuffer);

    // Check if dcraw is available
    let dcrawPath: string = DCRAW_PATH;

    // Try to find dcraw in common locations
    const possiblePaths = [
      DCRAW_PATH,
      '/opt/homebrew/bin/dcraw', // macOS ARM (Apple Silicon) - Homebrew default
      '/usr/local/bin/dcraw', // macOS Intel or older Homebrew
      join(process.cwd(), 'dcraw'), // Local project directory
      '/usr/bin/dcraw', // System-wide installation
      '/opt/local/bin/dcraw', // macOS with MacPorts
    ];

    for (const path of possiblePaths) {
      try {
        await access(path, constants.F_OK);
        dcrawPath = path;
        console.log(`Found dcraw at: ${dcrawPath}`);
        break;
      } catch {
        // Path doesn't exist, try next
      }
    }

    // Try to verify dcraw works
    // Note: dcraw -i -v without input will exit with code 1 and output "No files to process."
    // This is expected behavior and means dcraw is working correctly
    try {
      await execFileAsync(dcrawPath, ['-i', '-v'], { timeout: 5000 });
    } catch (verifyError: any) {
      // dcraw -i -v will fail (no input file), but we should check if it's a real error
      // Exit code 1 with "No files to process" is normal and means dcraw works
      const errorOutput = (verifyError.stderr?.toString() || verifyError.stdout?.toString() || '').toLowerCase();
      const isWorking = 
        errorOutput.includes('dcraw') || 
        errorOutput.includes('dave coffin') ||
        errorOutput.includes('no files to process') ||
        (verifyError.code === 1 && errorOutput.trim().length > 0); // Exit code 1 with output is normal
      
      // Only throw if it seems like a real error (e.g., command not found, permission denied)
      if (!isWorking && verifyError.code !== 1) {
        throw new Error(
          `dcraw not found or not working. Please install dcraw.\n` +
          `Installation:\n` +
          `  macOS: brew install dcraw\n` +
          `  Ubuntu/Debian: sudo apt-get install dcraw\n` +
          `  Or download from: https://www.dechifro.org/dcraw/\n` +
          `Set DCRAW_PATH environment variable to specify custom location.\n` +
          `Error: ${verifyError.message || verifyError}`
        );
      }
      // If exit code is 1 and we have output, dcraw is working (just no input file)
    }

    console.log(`Decoding DNG with dcraw: ${dcrawPath}`);

    // dcraw options:
    // -w: use camera white balance
    // -q 3: high quality interpolation (AHD - Adaptive Homogeneity-Directed)
    // -o 0: sRGB color space
    // -T: write TIFF format (lossless, better quality than PPM)
    // Output will be: ${inputFile}.tiff
    
    const dcrawArgs = [
      '-w',           // Use camera white balance
      '-q', '3',      // High quality interpolation (AHD)
      '-o', '0',      // sRGB color space
      '-T',           // Write TIFF format
      inputFile,
    ];

    // Execute dcraw - it will create output by replacing the extension with .tiff
    // e.g., file.DNG becomes file.tiff (not file.DNG.tiff)
    const tiffOutputPath = inputFile.replace(/\.(dng|DNG|nef|NEF|cr2|CR2|arw|ARW)$/i, '.tiff');
    
    // Set PATH to include Homebrew locations for Next.js API routes
    const extendedPath = getExtendedPath();
    
    console.log(`Executing dcraw with args: ${dcrawArgs.join(' ')}`);
    console.log(`Input file: ${inputFile}`);
    console.log(`Expected output file: ${tiffOutputPath}`);
    
    // Execute dcraw - capture both stdout and stderr
    let execResult: any;
    let hadError = false;
    let errorDetails: any = null;
    
    try {
      execResult = await execFileAsync(dcrawPath, dcrawArgs, {
        timeout: 30000, // 30 second timeout for large DNG files
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for output
        env: { ...process.env, PATH: extendedPath },
      });
      
      // Log any stdout/stderr from dcraw
      if (execResult.stdout && execResult.stdout.toString().trim()) {
        console.log('dcraw stdout:', execResult.stdout.toString().substring(0, 500));
      }
      if (execResult.stderr && execResult.stderr.toString().trim()) {
        console.warn('dcraw stderr (non-fatal):', execResult.stderr.toString().substring(0, 500));
      }
    } catch (execError: any) {
      hadError = true;
      errorDetails = execError;
      const errorMsg = execError.stderr?.toString() || '';
      const stdout = execError.stdout?.toString() || '';
      console.error('dcraw execution threw error:', {
        code: execError.code,
        message: execError.message,
        stderr: errorMsg.substring(0, 500),
        stdout: stdout.substring(0, 500),
      });
      
      // Don't throw yet - check if output file was created despite the error
    }
    
    // Always check if output file exists, regardless of whether execFileAsync threw
    // Sometimes dcraw may exit with error code but still create the file
    const fsPromises = await import('fs/promises');
    try {
      await access(tiffOutputPath, constants.F_OK);
      const stats = await fsPromises.stat(tiffOutputPath);
      
      if (stats.size === 0) {
        throw new Error(`dcraw created empty output file: ${tiffOutputPath}`);
      }
      
      console.log(`✓ Output file created successfully: ${tiffOutputPath} (${stats.size} bytes)`);
      // File exists and is not empty - success!
    } catch (fileError: any) {
      // Output file doesn't exist or is empty
      if (hadError && errorDetails) {
        // We had an execution error and no file was created
        const errorMsg = errorDetails.stderr?.toString() || errorDetails.message || '';
        throw new Error(
          `dcraw failed to process DNG file: ${errorMsg}\n` +
          `Command: ${dcrawPath} ${dcrawArgs.join(' ')}\n` +
          `Exit code: ${errorDetails.code || 'unknown'}\n` +
          `Input file: ${inputFile}`
        );
      } else {
        // No execution error but file wasn't created - dcraw may have failed silently
        const files = await fsPromises.readdir(tempDir).catch(() => []);
        throw new Error(
          `dcraw completed without error but output file not found: ${tiffOutputPath}\n` +
          `This may indicate the DNG file is corrupted or in an unsupported format.\n` +
          `Files in temp directory: ${files.join(', ')}\n` +
          `Original error: ${fileError.message}`
        );
      }
    }

    // Read the generated TIFF file
    // (File existence already checked in the try/catch above)
    const tiffBuffer = await readFile(tiffOutputPath);

    console.log(`✓ Successfully decoded DNG: ${tiffBuffer.length} bytes TIFF`);

    // Clean up temp files
    try {
      await unlink(inputFile);
      await unlink(tiffOutputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
      console.warn('Failed to cleanup temp files:', cleanupError);
    }

    return tiffBuffer;
  } catch (error: any) {
    // Clean up temp files on error
    if (tempDir) {
      try {
        if (inputFile) await unlink(inputFile).catch(() => {});
        const tiffFile = join(tempDir, `${filename}.tiff`);
        await unlink(tiffFile).catch(() => {});
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    throw new Error(
      `Failed to decode DNG with dcraw: ${error.message || error}\n` +
      `Ensure dcraw is installed and accessible.`
    );
  }
}
