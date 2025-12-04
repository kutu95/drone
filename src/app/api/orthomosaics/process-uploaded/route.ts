import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { processWithODM } from '@/lib/odm-processor';
import { mkdtemp, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';
export const maxDuration = 3600; // 60 minutes

/**
 * Process orthomosaic from uploaded photos in Supabase Storage
 * POST /api/orthomosaics/process-uploaded
 * 
 * Body: { 
 *   projectId: string,
 *   photoUrls: string[], // Supabase Storage URLs
 *   orthophotoResolution?: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    let user;
    let authenticatedClient;

    try {
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await authenticatedClient.auth.getUser();
      if (!authError && userFromSession) {
        user = userFromSession;
      }
    } catch (cookieError) {
      console.error('Cookie auth failed:', cookieError);
    }

    if (!user) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
        const { data: { user: userFromToken }, error } = await authenticatedClient.auth.getUser(token);
        if (!error && userFromToken) {
          user = userFromToken;
        }
      }
    }

    if (!user || !authenticatedClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { projectId, photoUrls, orthophotoResolution = 2.0 } = body;

    if (!projectId || !photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
      return NextResponse.json(
        { error: 'projectId and photoUrls array are required' },
        { status: 400 }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await authenticatedClient
      .from('orthomosaic_projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Update status to processing
    const { updateOrthomosaicProject } = await import('@/lib/supabase');
    await updateOrthomosaicProject(projectId, {
      status: 'processing',
      processingStartedAt: new Date().toISOString(),
    });

    try {
      // Download photos from Supabase Storage
      const tempDir = await mkdtemp(join(tmpdir(), 'odm-process-'));
      const imagesDir = join(tempDir, 'images');
      const outputDir = join(tempDir, 'output');
      await mkdir(imagesDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      console.log(`Downloading ${photoUrls.length} photos from Supabase Storage...`);
      const photoPaths: string[] = [];

      for (let i = 0; i < photoUrls.length; i++) {
        const photoUrl = photoUrls[i];
        try {
          // Extract bucket and path from URL
          const urlObj = new URL(photoUrl);
          const pathParts = urlObj.pathname.split('/');
          const bucketIndex = pathParts.findIndex(p => p && !p.includes('supabase'));
          if (bucketIndex === -1 || bucketIndex === pathParts.length - 1) {
            console.warn(`Could not parse photo URL: ${photoUrl}`);
            continue;
          }

          const bucket = pathParts[bucketIndex];
          const filePath = pathParts.slice(bucketIndex + 1).join('/');

          // Download file
          const { data: fileData, error: downloadError } = await authenticatedClient.storage
            .from(bucket)
            .download(filePath);

          if (downloadError || !fileData) {
            console.warn(`Failed to download ${filePath}:`, downloadError);
            continue;
          }

          // Save to temp directory
          const filename = filePath.split('/').pop() || `photo_${i}.jpg`;
          const localPath = join(imagesDir, filename);
          const arrayBuffer = await fileData.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const { writeFile } = await import('fs/promises');
          await writeFile(localPath, buffer);
          photoPaths.push(localPath);

          if ((i + 1) % 50 === 0) {
            console.log(`Downloaded ${i + 1}/${photoUrls.length} photos...`);
          }
        } catch (error) {
          console.warn(`Error downloading photo ${i}:`, error);
          // Continue with other photos
        }
      }

      if (photoPaths.length === 0) {
        throw new Error('No photos were successfully downloaded');
      }

      console.log(`Successfully downloaded ${photoPaths.length} photos`);

      // Process with ODM
      const odmResult = await processWithODM({
        projectName: project.name,
        photoPaths,
        outputDir,
        orthophotoResolution,
      });

      if (!odmResult.success) {
        await updateOrthomosaicProject(projectId, {
          status: 'failed',
          processingError: odmResult.error,
        });
        return NextResponse.json(
          { error: odmResult.error, logs: odmResult.logs },
          { status: 500 }
        );
      }

      // Upload results to Supabase Storage
      console.log('Uploading orthomosaic results to Supabase Storage...');
      const storageBucket = 'orthomosaics';
      const projectStoragePath = `${user.id}/${projectId}`;

      let orthomosaicUrl: string | undefined;
      let demUrl: string | undefined;
      let tilesUrl: string | undefined;

      // Upload orthomosaic
      if (odmResult.orthomosaicPath) {
        const { readFile } = await import('fs/promises');
        const orthomosaicBuffer = await readFile(odmResult.orthomosaicPath);
        const orthomosaicFileName = 'orthomosaic.tif';
        const storagePath = `${projectStoragePath}/${orthomosaicFileName}`;

        const { error: uploadError } = await authenticatedClient.storage
          .from(storageBucket)
          .upload(storagePath, orthomosaicBuffer, {
            contentType: 'image/tiff',
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = authenticatedClient.storage
            .from(storageBucket)
            .getPublicUrl(storagePath);
          orthomosaicUrl = urlData.publicUrl;
        } else {
          console.error('Failed to upload orthomosaic:', uploadError);
        }
      }

      // Upload DEM if available
      if (odmResult.demPath) {
        const { readFile } = await import('fs/promises');
        const demBuffer = await readFile(odmResult.demPath);
        const demFileName = 'dem.tif';
        const storagePath = `${projectStoragePath}/${demFileName}`;

        const { error: uploadError } = await authenticatedClient.storage
          .from(storageBucket)
          .upload(storagePath, demBuffer, {
            contentType: 'image/tiff',
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = authenticatedClient.storage
            .from(storageBucket)
            .getPublicUrl(storagePath);
          demUrl = urlData.publicUrl;
        }
      }

      // Update project with results
      await updateOrthomosaicProject(projectId, {
        status: 'completed',
        processingCompletedAt: new Date().toISOString(),
        orthomosaicUrl,
        demUrl,
        orthomosaicTilesUrl: tilesUrl,
      });

      return NextResponse.json({
        success: true,
        projectId,
        orthomosaicUrl,
        demUrl,
        message: 'Orthomosaic processing completed successfully',
      });
    } catch (error) {
      console.error('ODM processing error:', error);
      
      await updateOrthomosaicProject(projectId, {
        status: 'failed',
        processingError: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          error: 'Failed to process orthomosaic',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in process-uploaded endpoint:', error);
    return NextResponse.json(
      {
        error: 'Failed to process orthomosaic',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

