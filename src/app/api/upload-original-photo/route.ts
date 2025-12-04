import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for large file uploads

/**
 * Upload original photo file to Supabase Storage
 * POST /api/upload-original-photo
 * Body: FormData with 'file' (File object), 'filename' (string), and 'dataPointId' (string)
 * Returns: { originalFileUrl: string }
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

    // Get the file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;
    const dataPointId = formData.get('dataPointId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Use provided dataPointId
    const actualDataPointId = dataPointId;
    
    if (!actualDataPointId) {
      return NextResponse.json(
        { error: 'No dataPointId provided' },
        { status: 400 }
      );
    }

    // Verify the data point belongs to a flight log owned by the user
    const { data: dataPoint, error: dpError } = await authenticatedClient
      .from('flight_log_data_points')
      .select('id, flight_log_id')
      .eq('id', actualDataPointId)
      .single();

    if (dpError || !dataPoint) {
      return NextResponse.json(
        { error: 'Data point not found' },
        { status: 404 }
      );
    }

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

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a unique filename for storage
    const storageFilename = `${user.id}/${actualDataPointId}/${filename || file.name}`;

    console.log('Uploading original file:', {
      filename: storageFilename,
      size: buffer.length,
      dataPointId: actualDataPointId,
      userId: user.id,
    });

    // Determine content type
    const contentType = file.type || 
      (filename?.toLowerCase().endsWith('.dng') ? 'image/x-adobe-dng' :
       filename?.toLowerCase().endsWith('.jpg') || filename?.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' :
       filename?.toLowerCase().endsWith('.png') ? 'image/png' :
       'application/octet-stream');

    // Upload original file to Supabase Storage
    const { data: uploadData, error: uploadError } = await authenticatedClient.storage
      .from('photo-originals')
      .upload(storageFilename, buffer, {
        contentType,
        upsert: true, // Allow overwriting if it exists
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Error uploading original file:', uploadError);
      
      let errorMessage = 'Failed to upload original file to storage';
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('The resource was not found')) {
        errorMessage = 'Storage bucket "photo-originals" does not exist. Please create it in your Supabase project.';
      } else if (uploadError.message?.includes('new row violates row-level security policy') || uploadError.message?.includes('RLS')) {
        errorMessage = 'Storage bucket access denied. Please check RLS policies for the "photo-originals" bucket.';
      } else {
        errorMessage = `Failed to upload original file: ${uploadError.message || 'Unknown error'}`;
      }

      return NextResponse.json(
        { 
          error: errorMessage,
          details: uploadError.message || 'Unknown storage error'
        },
        { status: 500 }
      );
    }

    // Get public URL for the original file
    const { data: urlData } = authenticatedClient.storage
      .from('photo-originals')
      .getPublicUrl(storageFilename);

    // Update the data point with the original file URL
    const { error: updateError } = await authenticatedClient
      .from('flight_log_data_points')
      .update({ original_file_url: urlData.publicUrl })
      .eq('id', actualDataPointId);

    if (updateError) {
      console.error('Error updating data point with original file URL:', updateError);
      // Don't fail the request - the file is uploaded, we just couldn't save the URL
    }

    return NextResponse.json({
      success: true,
      originalFileUrl: urlData.publicUrl,
      filename: storageFilename,
    });
  } catch (error) {
    console.error('Error uploading original photo:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload original photo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

