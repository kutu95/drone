import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import sharp from 'sharp';
import { decodeDNGWithDCRAW } from '@/lib/dng-decoder-cli';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Generate thumbnail from DNG file
 * POST /api/generate-thumbnail
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('Authorization');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    let user;
    
    // Try cookie-based auth first
    try {
      const serverSupabase = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await serverSupabase.auth.getUser();
      if (!authError && userFromSession) {
        user = userFromSession;
      }
    } catch (cookieError) {
      console.error('Cookie auth failed:', cookieError);
    }
    
    // Fallback to token-based auth
    if (!user && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      try {
        const { data: { user: userFromToken }, error } = await supabase.auth.getUser(token);
        if (!error && userFromToken) {
          user = userFromToken;
        }
      } catch (tokenError) {
        console.error('Token auth failed:', tokenError);
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get the file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type,
      bufferSize: buffer.length
    });

    // Check if it's a DNG file
    const isDNG = file.name.toLowerCase().endsWith('.dng') || 
                  filename?.toLowerCase().endsWith('.dng') ||
                  buffer.slice(0, 8).toString('ascii').includes('II') || // TIFF header
                  buffer.slice(0, 8).toString('ascii').includes('MM'); // TIFF header (big endian)

    let thumbnailBuffer: Buffer;
    let mimeType = 'image/jpeg';

    if (isDNG) {
      try {
        // Target: 1200px width (maintain aspect ratio)
        const TARGET_WIDTH = 1200;
        
        console.log('Processing DNG with dcraw for full-resolution extraction...');
        
        // Use dcraw to extract full-resolution raw data
        let fullResBuffer: Buffer;
        try {
          fullResBuffer = await decodeDNGWithDCRAW(buffer, filename || file.name);
          console.log(`✓ Successfully decoded DNG with dcraw (${fullResBuffer.length} bytes)`);
          
          // Process the full-resolution TIFF from dcraw with Sharp
          const fullResImage = sharp(fullResBuffer);
          const fullResMetadata = await fullResImage.metadata();
          
          console.log('Full-resolution DNG decoded:', {
            width: fullResMetadata.width,
            height: fullResMetadata.height,
            format: fullResMetadata.format,
          });
          
          const sourceWidth = fullResMetadata.width || 0;
          const sourceHeight = fullResMetadata.height || 0;
          const aspectRatio = sourceHeight / sourceWidth;
          const targetHeight = Math.round(TARGET_WIDTH * aspectRatio);
          
          // Resize to exactly 1200px width
          thumbnailBuffer = await fullResImage
            .rotate() // Auto-orient based on EXIF
            .resize(TARGET_WIDTH, targetHeight, {
              fit: 'fill',
              withoutEnlargement: false, // Shouldn't be needed if full-res was extracted
              kernel: sharp.kernel.lanczos3,
            })
            .jpeg({ 
              quality: 92,
              mozjpeg: true,
              progressive: true,
            })
            .toBuffer();
          
          // Verify final result
          const finalMetadata = await sharp(thumbnailBuffer).metadata();
          const finalWidth = finalMetadata.width || 0;
          const finalHeight = finalMetadata.height || 0;
          
          console.log('Final thumbnail result:', {
            width: finalWidth,
            height: finalHeight,
            targetWas: `${TARGET_WIDTH}px wide`,
            achieved: finalWidth === TARGET_WIDTH ? '✓ Exact width' : `⚠ Width mismatch (got ${finalWidth}px)`,
          });
        } catch (dcrawError: any) {
          console.warn('dcraw decoding failed, falling back to Sharp embedded preview:', dcrawError.message || dcrawError);
          
          // Fallback to Sharp if dcraw is not available
          const image = sharp(buffer, { failOn: 'none' });
          const metadata = await image.metadata();
          
          console.log('DNG metadata (Sharp fallback):', {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
          });
          
          const sourceWidth = metadata.width || 0;
          const sourceHeight = metadata.height || 0;
          const aspectRatio = sourceHeight / sourceWidth;
          const targetHeight = Math.round(TARGET_WIDTH * aspectRatio);
          
          thumbnailBuffer = await image
            .rotate()
            .resize(TARGET_WIDTH, targetHeight, {
              fit: 'fill',
              withoutEnlargement: false, // Allow upscaling if embedded preview is smaller
              kernel: sharp.kernel.lanczos3,
            })
            .jpeg({ 
              quality: 92,
              mozjpeg: true,
              progressive: true,
            })
            .toBuffer();
          
          const finalMetadata = await sharp(thumbnailBuffer).metadata();
          console.log('Final thumbnail (Sharp fallback):', {
            width: finalMetadata.width,
            height: finalMetadata.height,
            note: 'Using embedded preview - may be limited resolution',
          });
        }
      } catch (error) {
        console.error('Error processing DNG file:', error);
        return NextResponse.json(
          { error: 'Failed to extract thumbnail from DNG file' },
          { status: 400 }
        );
      }
    } else {
      // For other image formats (JPG, etc), extract full resolution and only downscale if needed
      try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        
        const maxDimension = Math.max(metadata.width || 0, metadata.height || 0);
        const targetMaxSize = 2000;
        
        if (maxDimension > targetMaxSize) {
          // Downscale if larger than target
          thumbnailBuffer = await image
            .resize(targetMaxSize, targetMaxSize, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ 
              quality: 92,
              mozjpeg: true,
            })
            .toBuffer();
        } else {
          // Use full resolution if smaller or equal to target
          thumbnailBuffer = await image
            .jpeg({ 
              quality: 92,
              mozjpeg: true,
            })
            .toBuffer();
        }
      } catch (error) {
        console.error('Error processing image file:', error);
        return NextResponse.json(
          { error: 'Failed to process image file' },
          { status: 400 }
        );
      }
    }

    // Create authenticated Supabase client for storage
    // For storage uploads, we need to ensure the access token is properly set
    let authenticatedClient;
    try {
      // First try to get the access token from the request
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      
      if (token) {
        // Use the token-based authenticated client for storage operations
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
      } else {
        // Fallback to server-side client
        authenticatedClient = await createServerSupabaseClient();
        const { data: { user: verifiedUser }, error: verifyError } = await authenticatedClient.auth.getUser();
        
        if (verifyError || !verifiedUser || verifiedUser.id !== user.id) {
          throw new Error('Failed to verify authentication');
        }
      }
    } catch (authError) {
      return NextResponse.json(
        { error: `Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}` },
        { status: 401 }
      );
    }

    // Generate a unique filename for the thumbnail
    const thumbnailFilename = `${user.id}/${Date.now()}_${filename || file.name.replace(/\.(dng|DNG)$/i, '')}.jpg`;
    
    console.log('Uploading thumbnail:', {
      filename: thumbnailFilename,
      bufferSize: thumbnailBuffer.length,
      mimeType,
      userId: user.id,
      bucket: 'photo-thumbnails'
    });

    // Upload thumbnail to Supabase Storage
    // Note: Even for public buckets, authenticated users need proper token for uploads
    const { data: uploadData, error: uploadError } = await authenticatedClient.storage
      .from('photo-thumbnails')
      .upload(thumbnailFilename, thumbnailBuffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Error uploading thumbnail:', uploadError);
      console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
      console.error('Thumbnail filename:', thumbnailFilename);
      console.error('Thumbnail buffer size:', thumbnailBuffer.length);
      console.error('User ID:', user.id);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to upload thumbnail to storage';
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('The resource was not found')) {
        errorMessage = 'Storage bucket "photo-thumbnails" does not exist. Please create it in your Supabase project.';
      } else if (uploadError.message?.includes('new row violates row-level security policy') || uploadError.message?.includes('RLS')) {
        errorMessage = 'Storage bucket access denied. Please check RLS policies for the "photo-thumbnails" bucket. The bucket may need to be public or have appropriate RLS policies.';
      } else if (uploadError.message?.includes('Duplicate')) {
        errorMessage = 'A thumbnail with this filename already exists.';
      } else {
        errorMessage = `Failed to upload thumbnail: ${uploadError.message || 'Unknown error'}`;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: uploadError.message || 'Unknown storage error',
          errorCode: uploadError.statusCode || uploadError.code,
          fullError: process.env.NODE_ENV === 'development' ? JSON.stringify(uploadError, Object.getOwnPropertyNames(uploadError)) : undefined
        },
        { status: 500 }
      );
    }

    // Get public URL for the thumbnail
    const { data: urlData } = authenticatedClient.storage
      .from('photo-thumbnails')
      .getPublicUrl(thumbnailFilename);

    return NextResponse.json({
      success: true,
      thumbnailUrl: urlData.publicUrl,
      filename: thumbnailFilename,
    });
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate thumbnail',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

