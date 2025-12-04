import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const flightLogId = params.id;

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
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fallback to token-based auth
    if (!user && request.headers.get('Authorization')?.startsWith('Bearer ')) {
      const token = request.headers.get('Authorization')!.substring(7);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

    // Verify the flight log belongs to the user
    const { data: flightLog, error: logError } = await authenticatedClient
      .from('flight_logs')
      .select('id, owner_id')
      .eq('id', flightLogId)
      .eq('owner_id', user.id)
      .single();

    if (logError || !flightLog) {
      return NextResponse.json(
        { error: 'Flight log not found or access denied' },
        { status: 404 }
      );
    }

    // Get all photo data points for this flight log to find thumbnail URLs
    const { data: photoDataPoints, error: fetchError } = await authenticatedClient
      .from('flight_log_data_points')
      .select('id, thumbnail_url')
      .eq('flight_log_id', flightLogId)
      .eq('is_photo', true)
      .not('thumbnail_url', 'is', null);

    if (fetchError) {
      console.error('Error fetching photo data points:', fetchError);
      return NextResponse.json(
        { error: `Failed to fetch photo data points: ${fetchError.message}` },
        { status: 500 }
      );
    }

    // Delete thumbnails from storage
    const deletedThumbnails: string[] = [];
    const failedThumbnails: string[] = [];

    if (photoDataPoints && photoDataPoints.length > 0) {
      for (const dataPoint of photoDataPoints) {
        if (dataPoint.thumbnail_url) {
          try {
            // Extract the storage path from the URL
            // URL format: https://...supabase.co/storage/v1/object/public/photo-thumbnails/user_id/path/to/file.jpg
            // Or just the path: user_id/path/to/file.jpg
            let storagePath = dataPoint.thumbnail_url;
            
            // If it's a full URL, extract the path after 'photo-thumbnails/'
            const urlMatch = storagePath.match(/photo-thumbnails\/(.+)$/);
            if (urlMatch) {
              storagePath = urlMatch[1];
            }

            const { error: deleteError } = await authenticatedClient.storage
              .from('photo-thumbnails')
              .remove([storagePath]);

            if (deleteError) {
              console.error(`Failed to delete thumbnail ${storagePath}:`, deleteError);
              failedThumbnails.push(storagePath);
            } else {
              deletedThumbnails.push(storagePath);
            }
          } catch (error) {
            console.error(`Error deleting thumbnail for data point ${dataPoint.id}:`, error);
            failedThumbnails.push(dataPoint.thumbnail_url || 'unknown');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount: deletedThumbnails.length,
      failedCount: failedThumbnails.length,
      message: `Deleted ${deletedThumbnails.length} thumbnail(s). ${failedThumbnails.length > 0 ? `${failedThumbnails.length} failed.` : ''}`,
    });
  } catch (error) {
    console.error('Error in delete-thumbnails API:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete thumbnails',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

