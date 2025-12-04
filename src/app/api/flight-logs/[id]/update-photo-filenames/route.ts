import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * Update photo filenames for a flight log
 * POST /api/flight-logs/[id]/update-photo-filenames
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const flightLogId = params.id;
    const { updates } = await request.json();

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Invalid request: updates must be an array' },
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

    // Create authenticated client
    let authenticatedClient;
    try {
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: verifiedUser }, error: verifyError } = await authenticatedClient.auth.getUser();
      
      if (verifyError || !verifiedUser || verifiedUser.id !== user.id) {
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (token) {
          authenticatedClient = await createAuthenticatedSupabaseClient(token);
        } else {
          throw new Error('Failed to verify authentication');
        }
      }
    } catch (authError) {
      return NextResponse.json(
        { error: `Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}` },
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

    // Fetch all photo data points for this flight log
    // The dataPointIndex in updates refers to the index in the filtered photos array
    const { data: photoDataPoints, error: photoFetchError } = await authenticatedClient
      .from('flight_log_data_points')
      .select('id, timestamp_offset_ms, photo_filename, thumbnail_url, original_file_url, is_photo')
      .eq('flight_log_id', flightLogId)
      .eq('is_photo', true)
      .order('timestamp_offset_ms', { ascending: true });

    console.log(`[Update Photo Filenames] Found ${photoDataPoints?.length || 0} photo data points for flight log ${flightLogId}`);
    console.log(`[Update Photo Filenames] Received ${updates.length} update(s):`, updates.map((u: any) => ({ index: u.dataPointIndex, filename: u.filename, hasThumbnail: !!u.thumbnailUrl })));

    if (photoFetchError) {
      console.error('Error fetching photo data points:', photoFetchError);
      return NextResponse.json(
        { error: 'Failed to fetch photo data points' },
        { status: 500 }
      );
    }

    if (!photoDataPoints || photoDataPoints.length === 0) {
      return NextResponse.json(
        { error: 'No photo data points found for this flight log' },
        { status: 404 }
      );
    }

    // Update each photo filename
    // The dataPointIndex in updates matches the index in the photoDataPoints array
    const updatePromises = updates.map(async (update: { dataPointIndex: number; filename: string; thumbnailUrl?: string | null; originalFileUrl?: string | null }) => {
      if (update.dataPointIndex < 0 || update.dataPointIndex >= photoDataPoints.length) {
        console.warn(`Photo data point at index ${update.dataPointIndex} is out of range`);
        return null;
      }

      const photoDataPoint = photoDataPoints[update.dataPointIndex];
      
      if (!photoDataPoint) {
        console.warn(`Photo data point at index ${update.dataPointIndex} not found`);
        return null;
      }

      const updateData: { photo_filename: string; thumbnail_url?: string | null; original_file_url?: string | null } = {
        photo_filename: update.filename,
      };

      // Include thumbnail URL if provided
      if (update.thumbnailUrl !== undefined) {
        updateData.thumbnail_url = update.thumbnailUrl;
      }

      // Include original file URL if provided
      if (update.originalFileUrl !== undefined) {
        updateData.original_file_url = update.originalFileUrl;
      }

      console.log(`[Update Photo Filenames] Updating data point ${photoDataPoint.id} (index ${update.dataPointIndex}):`, updateData);

      const { error: updateError } = await authenticatedClient
        .from('flight_log_data_points')
        .update(updateData)
        .eq('id', photoDataPoint.id);

      if (updateError) {
        console.error(`[Update Photo Filenames] Error updating photo filename for data point ${photoDataPoint.id}:`, updateError);
        throw updateError;
      }

      console.log(`[Update Photo Filenames] Successfully updated data point ${photoDataPoint.id}`);

      return { id: photoDataPoint.id, filename: update.filename, thumbnailUrl: update.thumbnailUrl };
    });

    const results = await Promise.all(updatePromises);
    const successful = results.filter(r => r !== null);

    console.log(`Successfully updated ${successful.length} photo filename(s)`);

    return NextResponse.json({
      success: true,
      updated: successful.length,
      message: `Updated ${successful.length} photo filename(s) successfully.`,
    });
  } catch (error) {
    console.error('Error updating photo filenames:', error);
    return NextResponse.json(
      {
        error: 'Failed to update photo filenames',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

