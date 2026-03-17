import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';

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

export interface VideoSearchResult {
  flightLogId: string;
  flightDate: string | null;
  videoFilenames: string[];
  /** Representative point in bounds for map marker */
  lat: number;
  lng: number;
  /** Path points where the drone was recording video (for drawing red polyline) */
  recordingPath: Array<{ lat: number; lng: number }>;
}

export async function POST(request: NextRequest) {
  try {
    let user;
    let authenticatedClient;

    try {
      authenticatedClient = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await authenticatedClient.auth.getUser();
      if (!authError && userFromSession) user = userFromSession;
    } catch {
      // ignore
    }

    if (!user && request.headers.get('Authorization')?.startsWith('Bearer ')) {
      const token = request.headers.get('Authorization')!.substring(7);
      try {
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
        const { data: { user: userFromToken } } = await authenticatedClient.auth.getUser();
        if (userFromToken) user = userFromToken;
      } catch {
        // ignore
      }
    }

    if (!user || !authenticatedClient) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = authenticatedClient;
    const body: SearchParams = await request.json();
    const { bounds, startDate: startDateRaw, endDate: endDateRaw } = body;

    if (!bounds?.north || !bounds?.south || !bounds?.east || !bounds?.west) {
      return NextResponse.json({ error: 'Invalid bounds' }, { status: 400 });
    }

    // Normalize to YYYY-MM-DD so DB comparison is consistent (avoids timezone/format issues)
    const toDateOnly = (val: string | undefined): string | null => {
      if (!val || typeof val !== 'string') return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    const startDate = toDateOnly(startDateRaw);
    const endDate = toDateOnly(endDateRaw);

    let flightLogQuery = supabase
      .from('flight_logs')
      .select('id')
      .eq('owner_id', user.id);

    if (startDate) {
      flightLogQuery = flightLogQuery.gte('flight_date', startDate);
    }
    if (endDate) {
      const endPlusOne = new Date(endDate + 'T23:59:59.999Z');
      endPlusOne.setUTCDate(endPlusOne.getUTCDate() + 1);
      flightLogQuery = flightLogQuery.lt('flight_date', endPlusOne.toISOString());
    }

    const { data: flightLogs, error: flightLogError } = await flightLogQuery;
    if (flightLogError) {
      return NextResponse.json(
        { error: 'Failed to fetch flight logs', details: flightLogError.message },
        { status: 500 }
      );
    }

    const flightLogIds = (flightLogs || []).map((r: { id: string }) => r.id);
    if (flightLogIds.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    const BATCH_SIZE = 50;
    const flightIdsWithPointInBounds = new Map<string, { lat: number; lng: number }>();
    const flightIdsWithRecordingInBounds = new Set<string>();

    for (let i = 0; i < flightLogIds.length; i += BATCH_SIZE) {
      const batch = flightLogIds.slice(i, i + BATCH_SIZE);
      const { data: points, error: pointsError } = await supabase
        .from('flight_log_data_points')
        .select('flight_log_id, lat, lng, is_video_recording')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .in('flight_log_id', batch);

      if (pointsError) {
        return NextResponse.json(
          { error: 'Failed to search flight path points', details: pointsError.message },
          { status: 500 }
        );
      }

      for (const p of points || []) {
        if (p.lat == null || p.lng == null) continue;
        if (!flightIdsWithPointInBounds.has(p.flight_log_id)) {
          flightIdsWithPointInBounds.set(p.flight_log_id, { lat: p.lat, lng: p.lng });
        }
        if (p.is_video_recording === true) {
          flightIdsWithRecordingInBounds.add(p.flight_log_id);
        }
      }
    }

    const idsInBounds = Array.from(flightIdsWithPointInBounds.keys());
    if (idsInBounds.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    const { data: logsWithMeta, error: logsError } = await supabase
      .from('flight_logs')
      .select('id, flight_date, metadata')
      .in('id', idsInBounds);

    if (logsError) {
      return NextResponse.json(
        { error: 'Failed to fetch flight logs metadata', details: logsError.message },
        { status: 500 }
      );
    }

    const meta = (logsWithMeta || []) as Array<{
      id: string;
      flight_date: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    const videoLogIds: Array<{ log: typeof meta[0]; pos: { lat: number; lng: number } }> = [];
    for (const log of meta) {
      const pos = flightIdsWithPointInBounds.get(log.id);
      if (!pos) continue;
      const filenames = log.metadata?.video_filenames;
      const hasLinkedVideos = Array.isArray(filenames) && filenames.length > 0;
      const hasRecordingInBounds = flightIdsWithRecordingInBounds.has(log.id);
      if (hasLinkedVideos || hasRecordingInBounds) {
        videoLogIds.push({ log, pos });
      }
    }

    const MAX_RECORDING_POINTS = 1500;
    const videos: VideoSearchResult[] = [];

    for (const { log, pos } of videoLogIds) {
      const { data: recordingPoints, error: recError } = await supabase
        .from('flight_log_data_points')
        .select('lat, lng, timestamp_offset_ms')
        .eq('flight_log_id', log.id)
        .eq('is_video_recording', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('timestamp_offset_ms', { ascending: true });

      if (recError) {
        console.warn(`Recording path for flight ${log.id}:`, recError.message);
        videos.push({
          flightLogId: log.id,
          flightDate: log.flight_date ?? null,
          videoFilenames: (log.metadata?.video_filenames as string[]) ?? [],
          lat: pos.lat,
          lng: pos.lng,
          recordingPath: [],
        });
        continue;
      }

      const raw = (recordingPoints || []) as Array<{ lat: number; lng: number; timestamp_offset_ms: number | null }>;
      let recordingPath = raw
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat!, lng: p.lng! }));

      if (recordingPath.length > MAX_RECORDING_POINTS) {
        const step = Math.ceil(recordingPath.length / MAX_RECORDING_POINTS);
        recordingPath = recordingPath.filter((_, i) => i % step === 0 || i === recordingPath.length - 1);
      }

      videos.push({
        flightLogId: log.id,
        flightDate: log.flight_date ?? null,
        videoFilenames: (log.metadata?.video_filenames as string[]) ?? [],
        lat: pos.lat,
        lng: pos.lng,
        recordingPath,
      });
    }

    // Defensive: only return flights whose flight_date is within the requested range
    const filteredVideos =
      startDate || endDate
        ? videos.filter((v) => {
            const fd = v.flightDate ? toDateOnly(v.flightDate) : null;
            if (!fd) return false;
            if (startDate && fd < startDate) return false;
            if (endDate && fd > endDate) return false;
            return true;
          })
        : videos;

    return NextResponse.json({ videos: filteredVideos });
  } catch (error: unknown) {
    console.error('Video search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
