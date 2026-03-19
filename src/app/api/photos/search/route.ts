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
    console.log('📸 Photo search API called');
    console.log('Environment check:', {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public',
    });

    // Authenticate user - try cookie-based auth first, then token-based
    let user;
    let authenticatedClient;

    // Try cookie-based auth first (more reliable in Next.js)
    try {
      console.log('Attempting cookie-based auth...');
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await authenticatedClient.auth.getUser();
      if (!authError && userFromSession) {
        user = userFromSession;
        console.log('✅ Cookie auth successful, user:', user.id);
      } else {
        console.log('⚠️ Cookie auth failed:', authError?.message);
      }
    } catch (cookieError: any) {
      console.error('❌ Cookie auth exception:', cookieError?.message || cookieError);
    }

    // Fallback: try token from Authorization header
    if (!user && request.headers.get('Authorization')?.startsWith('Bearer ')) {
      const token = request.headers.get('Authorization')!.substring(7);
      try {
        console.log('Attempting token-based auth...');
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
        const { data: { user: userFromToken } } = await authenticatedClient.auth.getUser();
        if (userFromToken) {
          user = userFromToken;
          console.log('✅ Token auth successful, user:', user.id);
        } else {
          console.log('⚠️ Token auth failed: no user returned');
        }
      } catch (tokenError: any) {
        console.error('❌ Token auth exception:', tokenError?.message || tokenError);
      }
    }

    if (!user || !authenticatedClient) {
      console.error('❌ Authentication failed - no user or client');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = authenticatedClient;

    const body: SearchParams = await request.json();
    const { bounds, startDate, endDate } = body;

    if (!bounds || !bounds.north || !bounds.south || !bounds.east || !bounds.west) {
      return NextResponse.json({ error: 'Invalid bounds provided' }, { status: 400 });
    }

    // First, get flight logs that match date criteria and belong to user.
    // We include flight_date so we don't rely on PostgREST schema-cache relationships
    // (the `flight_logs!inner(...)` nested select can fail if the relationship cache
    // isn't aware of the FK).
    let flightLogQuery = supabase
      .from('flight_logs')
      .select('id, flight_date')
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

    console.log('🔍 Querying flight logs for user:', user.id);
    const { data: flightLogs, error: flightLogError } = await flightLogQuery;

    if (flightLogError) {
      console.error('❌ Error fetching flight logs:', {
        message: flightLogError.message,
        details: flightLogError.details,
        hint: flightLogError.hint,
        code: flightLogError.code,
      });
      return NextResponse.json(
        { error: 'Failed to fetch flight logs', details: flightLogError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${flightLogs?.length || 0} flight logs`);

    const flightLogIds = (flightLogs || []).map((log: { id: string }) => log.id);
    const flightDateByLogId = new Map<string, string | null>(
      (flightLogs || []).map((log: { id: string; flight_date: string | null }) => [log.id, log.flight_date]),
    );

    if (flightLogIds.length === 0) {
      return NextResponse.json({ photos: [] });
    }

    console.log('🔍 Photo search bounds:', {
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
      flightLogIds: flightLogIds.length,
    });

    // Batch flight log IDs to avoid headers overflow error
    // Supabase has limits on URL/header size, so we need to query in batches
    const BATCH_SIZE = 50; // Process 50 flight logs at a time
    const allPhotoDataPoints: any[] = [];

    for (let i = 0; i < flightLogIds.length; i += BATCH_SIZE) {
      const batch = flightLogIds.slice(i, i + BATCH_SIZE);
      console.log(`📦 Querying batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(flightLogIds.length / BATCH_SIZE)} (${batch.length} flight logs)`);

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
          heading_deg,
          gimbal_pitch_deg
        `)
        .eq('is_photo', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .in('flight_log_id', batch);

      if (photoError) {
        console.error(`❌ Error searching photos in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, photoError);
        return NextResponse.json(
          { error: 'Failed to search photos', details: photoError.message },
          { status: 500 }
        );
      }

      if (photoDataPoints && photoDataPoints.length > 0) {
        allPhotoDataPoints.push(...photoDataPoints);
        console.log(`  ✓ Found ${photoDataPoints.length} photos in this batch`);
      }
    }

    console.log(`✅ Found ${allPhotoDataPoints.length} total photos in bounds`);

    // Transform the data to include flight date for each photo
    const photos = allPhotoDataPoints.map((dp: any) => {
      // Calculate absolute timestamp from flight date and offset
      let absoluteTimestamp: string | null = null;
      const flightDateStr = flightDateByLogId.get(dp.flight_log_id) ?? null;
      if (flightDateStr && dp.timestamp_offset_ms !== null) {
        const flightDate = new Date(flightDateStr);
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
        headingDeg: dp.heading_deg ?? null,
        gimbalPitchDeg: dp.gimbal_pitch_deg ?? null,
        flightDate: flightDateStr,
        absoluteTimestamp,
      };
    });

    return NextResponse.json({ photos });
  } catch (error: any) {
    console.error('❌ Fatal error in photos search API:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause,
    });
    return NextResponse.json(
      {
        error: 'Failed to search photos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

