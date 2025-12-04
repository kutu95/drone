import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Serve original photo file, converting DNG to JPG on the fly if needed
 * GET /api/serve-original-photo?dataPointId=<id>
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dataPointId = searchParams.get('dataPointId');

    if (!dataPointId) {
      return NextResponse.json(
        { error: 'Missing dataPointId parameter' },
        { status: 400 }
      );
    }

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
    let authenticatedClient;

    // Try cookie-based auth first
    try {
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await authenticatedClient.auth.getUser();
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
          authenticatedClient = await createAuthenticatedSupabaseClient(token);
        }
      } catch (tokenError) {
        console.error('Token auth failed:', tokenError);
      }
    }

    if (!user || !authenticatedClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch the data point with original file URL
    const { data: dataPoint, error: dpError } = await authenticatedClient
      .from('flight_log_data_points')
      .select('id, original_file_url, photo_filename, flight_log_id')
      .eq('id', dataPointId)
      .single();

    if (dpError || !dataPoint) {
      return NextResponse.json(
        { error: 'Photo data point not found' },
        { status: 404 }
      );
    }

    // Verify the flight log belongs to the user
    const { data: flightLog, error: logError } = await authenticatedClient
      .from('flight_logs')
      .select('id, owner_id')
      .eq('id', dataPoint.flight_log_id)
      .eq('owner_id', user.id)
      .single();

    if (logError || !flightLog) {
      return NextResponse.json(
        { error: 'Flight log not found or access denied' },
        { status: 404 }
      );
    }

    if (!dataPoint.original_file_url) {
      return NextResponse.json(
        { error: 'Original file not available for this photo' },
        { status: 404 }
      );
    }

    // Extract the file path from the URL (format: /storage/v1/object/public/photo-originals/...)
    // or it might be a full URL
    let filePath: string;
    if (dataPoint.original_file_url.startsWith('http')) {
      // Full URL - extract path
      const url = new URL(dataPoint.original_file_url);
      filePath = url.pathname.replace('/storage/v1/object/public/', '');
    } else if (dataPoint.original_file_url.startsWith('/')) {
      // Path starting with / - assume it's already a storage path
      filePath = dataPoint.original_file_url.replace('/storage/v1/object/public/', '');
    } else {
      // Just the path - assume it's the bucket/key format
      filePath = dataPoint.original_file_url;
    }

    // Split into bucket and key
    const parts = filePath.split('/');
    const bucket = parts[0] || 'photo-originals';
    const key = parts.slice(1).join('/');

    console.log('Fetching original file:', { bucket, key, filePath });

    // Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await authenticatedClient.storage
      .from(bucket)
      .download(key);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download original file' },
        { status: 500 }
      );
    }

    // Convert File/Blob to buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if it's a DNG file
    const isDNG = key.toLowerCase().endsWith('.dng') || 
                  buffer.slice(0, 8).toString('ascii').includes('II') ||
                  buffer.slice(0, 8).toString('ascii').includes('MM');

    if (isDNG) {
      // Convert DNG to JPEG on the fly
      try {
        const jpegBuffer = await sharp(buffer)
          .jpeg({ 
            quality: 95,
            mozjpeg: true,
          })
          .toBuffer();

        return new NextResponse(jpegBuffer, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': jpegBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (error) {
        console.error('Error converting DNG to JPEG:', error);
        return NextResponse.json(
          { error: 'Failed to convert DNG to JPEG' },
          { status: 500 }
        );
      }
    } else {
      // Serve original file as-is
      const contentType = key.toLowerCase().endsWith('.jpg') || key.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : key.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'application/octet-stream';

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  } catch (error) {
    console.error('Error serving original photo:', error);
    return NextResponse.json(
      {
        error: 'Failed to serve original photo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

