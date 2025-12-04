import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { FlightLogDataPointDB } from '@/lib/types';

export const runtime = 'nodejs';

interface SearchParams {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  startDate?: string;
  endDate?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user - try cookie-based auth first, then token-based
    let user;
    let authenticatedClient;

    // Try cookie-based auth first (more reliable in Next.js)
    try {
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await authenticatedClient.auth.getUser();
      if (!authError && userFromSession) {
        user = userFromSession;
      }
    } catch (cookieError) {
      console.error('Cookie auth failed:', cookieError);
    }

    // Fallback: try token from Authorization header
    if (!user && request.headers.get('Authorization')?.startsWith('Bearer ')) {
      const token = request.headers.get('Authorization')!.substring(7);
      try {
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
        const { data: { user: userFromToken } } = await authenticatedClient.auth.getUser();
        if (userFromToken) {
          user = userFromToken;
        }
      } catch (tokenError) {
        console.error('Token auth failed:', tokenError);
      }
    }

    if (!user || !authenticatedClient) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = authenticatedClient;

    const body: SearchParams = await request.json();
    const { bounds, startDate, endDate } = body;

    if (!bounds || !bounds.north || !bounds.south || !bounds.east || !bounds.west) {
      return NextResponse.json({ error: 'Invalid bounds provided' }, { status: 400 });
    }

    // First, get flight log IDs that match date criteria and belong to user
    let flightLogQuery = supabase
      .from('flight_logs')
      .select('id')
      .eq('owner_id', user.id);

    if (startDate) {
      flightLogQuery = flightLogQuery.gte('flight_date', startDate);
    }
    if (endDate) {
      // Add one day to endDate to include the entire end date
      const endDatePlusOne = new Date(endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      flightLogQuery = flightLogQuery.lt('flight_date', endDatePlusOne.toISOString());
    }

    const { data: flightLogs, error: flightLogError } = await flightLogQuery;

    if (flightLogError) {
      console.error('Error fetching flight logs:', flightLogError);
      return NextResponse.json(
        { error: 'Failed to fetch flight logs', details: flightLogError.message },
        { status: 500 }
      );
    }

    const flightLogIds = (flightLogs || []).map((log: { id: string }) => log.id);

    if (flightLogIds.length === 0) {
      return NextResponse.json({ photos: [] });
    }

    // Now get photos within bounds from those flight logs
    const { data: photoDataPoints, error: photoError } = await supabase
      .from('flight_log_data_points')
      .select(`
        id,
        flight_log_id,
        lat,
        lng,
        altitude_m,
        timestamp_offset_ms,
        photo_filename,
        thumbnail_url,
        original_file_url,
        flight_logs!inner(
          id,
          flight_date,
          owner_id
        )
      `)
      .eq('is_photo', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lng', bounds.west)
      .lte('lng', bounds.east)
      .in('flight_log_id', flightLogIds);

    if (photoError) {
      console.error('Error searching photos:', photoError);
      return NextResponse.json(
        { error: 'Failed to search photos', details: photoError.message },
        { status: 500 }
      );
    }

    // Transform the data to include flight date for each photo
    const photos = (photoDataPoints || []).map((dp: any) => {
      // Calculate absolute timestamp from flight date and offset
      let absoluteTimestamp: string | null = null;
      if (dp.flight_logs?.flight_date && dp.timestamp_offset_ms !== null) {
        const flightDate = new Date(dp.flight_logs.flight_date);
        const absoluteDate = new Date(flightDate.getTime() + dp.timestamp_offset_ms);
        absoluteTimestamp = absoluteDate.toISOString();
      }

      return {
        id: dp.id,
        flightLogId: dp.flight_log_id,
        lat: dp.lat,
        lng: dp.lng,
        altitudeM: dp.altitude_m,
        timestampOffsetMs: dp.timestamp_offset_ms,
        photoFilename: dp.photo_filename,
        thumbnailUrl: dp.thumbnail_url,
        originalFileUrl: dp.original_file_url,
        flightDate: dp.flight_logs?.flight_date || null,
        absoluteTimestamp,
      };
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error('Error in photos search API:', error);
    return NextResponse.json(
      {
        error: 'Failed to search photos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

