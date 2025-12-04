import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdtemp, access, readFile, readdir, stat } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

/**
 * ODM Processor for creating orthomosaics from drone photos
 * Requires Docker and OpenDroneMap to be installed
 */

export interface ODMConfig {
  projectName: string;
  photoPaths: string[];
  outputDir: string;
  orthophotoResolution?: number; // cm/pixel
  odmPath?: string; // Path to ODM Docker image or CLI
}

export interface ODMResult {
  success: boolean;
  orthomosaicPath?: string;
  demPath?: string;
  pointCloudPath?: string;
  tilesPath?: string;
  error?: string;
  logs?: string;
}

/**
 * Check if Docker is available
 */
export async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if ODM Docker image is available
 */
export async function checkODMAvailable(odmImage: string = 'opendronemap/odm'): Promise<boolean> {
  try {
    const result = await execFileAsync('docker', ['images', '-q', odmImage], { timeout: 5000 });
    return result.stdout.toString().trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Pull ODM Docker image if not available
 */
export async function pullODMImage(odmImage: string = 'opendronemap/odm'): Promise<void> {
  console.log(`Pulling ODM Docker image: ${odmImage}...`);
  try {
    await execFileAsync('docker', ['pull', odmImage], {
      timeout: 600000, // 10 minutes timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    console.log('✓ ODM image pulled successfully');
  } catch (error) {
    throw new Error(`Failed to pull ODM Docker image: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Process photos with ODM to create orthomosaic
 */
export async function processWithODM(config: ODMConfig): Promise<ODMResult> {
  const { projectName, photoPaths, outputDir, orthophotoResolution = 2.0, odmPath = 'opendronemap/odm' } = config;

  // Check Docker availability
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    return {
      success: false,
      error: 'Docker is not installed or not available. Please install Docker to process orthomosaics.',
    };
  }

  // Check/install ODM
  const odmAvailable = await checkODMAvailable(odmPath);
  if (!odmAvailable) {
    try {
      await pullODMImage(odmPath);
    } catch (error) {
      return {
        success: false,
        error: `Failed to prepare ODM: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  // Create temporary directories
  let tempDir: string | null = null;
  let imagesDir: string | null = null;
  let odmOutputDir: string | null = null;

  try {
    tempDir = await mkdtemp(join(tmpdir(), 'odm-process-'));
    imagesDir = join(tempDir, 'images');
    odmOutputDir = join(tempDir, 'output');

    // Create directories
    const { mkdir } = await import('fs/promises');
    await mkdir(imagesDir, { recursive: true });
    await mkdir(odmOutputDir, { recursive: true });

    // Copy photos to images directory
    // Note: This is a simplified version - in production, you'd need to handle
    // the file paths correctly (they might be relative to a parent folder)
    console.log(`Copying ${photoPaths.length} photos to processing directory...`);
    const { copyFile } = await import('fs/promises');
    
    for (let i = 0; i < photoPaths.length; i++) {
      const photoPath = photoPaths[i];
      try {
        // Check if file exists
        await access(photoPath, constants.F_OK);
        const filename = photoPath.split('/').pop() || `photo_${i}.jpg`;
        const destPath = join(imagesDir, filename);
        await copyFile(photoPath, destPath);
      } catch (error) {
        console.warn(`Failed to copy photo ${photoPath}:`, error);
        // Continue with other photos
      }
    }

    // Count successfully copied photos
    const copiedFiles = await readdir(imagesDir);
    if (copiedFiles.length === 0) {
      return {
        success: false,
        error: 'No photos were successfully copied to processing directory. Check photo file paths.',
      };
    }

    console.log(`Successfully copied ${copiedFiles.length} photos`);

    // Prepare ODM command
    // ODM Docker command structure:
    // docker run -it -v <images_dir>:/code/images -v <output_dir>:/code/output opendronemap/odm --project-path /code [options]
    const odmArgs = [
      'run',
      '-i', // Interactive (required for some ODM operations)
      '--rm', // Remove container after execution
      '-v', `${imagesDir}:/code/images:ro`, // Read-only mount of images
      '-v', `${odmOutputDir}:/code/output`, // Output directory
      odmPath,
      '--project-path', '/code',
      '--orthophoto-resolution', orthophotoResolution.toString(),
      '--skip-3dmodel', // Skip 3D model to speed up processing
    ];

    console.log('Running ODM processing...');
    console.log(`Command: docker ${odmArgs.join(' ')}`);

    // Execute ODM (with extended timeout for large projects)
    const timeoutMs = 3600000; // 1 hour timeout
    const startTime = Date.now();

    try {
      const result = await execFileAsync('docker', odmArgs, {
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for output
      });

      const processingTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`✓ ODM processing completed in ${processingTime} minutes`);

      // Check for output files
      const outputFiles = await readdir(odmOutputDir);
      console.log('ODM output files:', outputFiles);

      // Look for orthomosaic file (typically named "odm_orthophoto.tif")
      const orthomosaicFile = outputFiles.find(f => 
        f.includes('orthophoto') && (f.endsWith('.tif') || f.endsWith('.tiff'))
      );
      
      const demFile = outputFiles.find(f => 
        f.includes('dem') && (f.endsWith('.tif') || f.endsWith('.tiff'))
      );

      const tilesDir = outputFiles.find(f => 
        f.includes('tiles') || f.includes('orthophoto_tiles')
      );

      if (!orthomosaicFile) {
        return {
          success: false,
          error: 'ODM processing completed but orthomosaic file not found in output',
          logs: result.stdout?.toString() || result.stderr?.toString(),
        };
      }

      // Copy results to final output directory
      const { mkdir: mkdirOutput } = await import('fs/promises');
      await mkdirOutput(outputDir, { recursive: true });

      const finalOrthomosaicPath = join(outputDir, 'orthomosaic.tif');
      const finalDemPath = demFile ? join(outputDir, 'dem.tif') : undefined;

      await copyFile(join(odmOutputDir, orthomosaicFile), finalOrthomosaicPath);
      if (demFile && finalDemPath) {
        await copyFile(join(odmOutputDir, demFile), finalDemPath);
      }

      // Copy tiles if available
      let finalTilesPath: string | undefined;
      if (tilesDir) {
        const sourceTilesDir = join(odmOutputDir, tilesDir);
        const destTilesDir = join(outputDir, 'tiles');
        const { cp } = await import('fs/promises');
        await cp(sourceTilesDir, destTilesDir, { recursive: true });
        finalTilesPath = destTilesDir;
      }

      return {
        success: true,
        orthomosaicPath: finalOrthomosaicPath,
        demPath: finalDemPath,
        tilesPath: finalTilesPath,
        logs: result.stdout?.toString().substring(0, 1000), // First 1000 chars of logs
      };
    } catch (execError: any) {
      const errorOutput = execError.stderr?.toString() || execError.stdout?.toString() || execError.message;
      console.error('ODM processing error:', errorOutput);
      
      return {
        success: false,
        error: `ODM processing failed: ${errorOutput.substring(0, 500)}`,
        logs: errorOutput.substring(0, 2000),
      };
    }
  } finally {
    // Cleanup temporary directory (optional - you might want to keep it for debugging)
    // if (tempDir) {
    //   try {
    //     const { rm } = await import('fs/promises');
    //     await rm(tempDir, { recursive: true, force: true });
    //   } catch (cleanupError) {
    //     console.warn('Failed to cleanup temp directory:', cleanupError);
    //   }
    // }
  }
}

