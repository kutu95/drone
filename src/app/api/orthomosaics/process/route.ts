import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { fetchFlightLog } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 3600; // 60 minutes for ODM processing

/**
 * Process orthomosaic from flight log photos
 * POST /api/orthomosaics/process
 * 
 * Body: { flightLogId: string, projectName: string }
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

    // Fallback to token-based auth
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
    const { flightLogId, projectName } = body;

    if (!flightLogId || !projectName) {
      return NextResponse.json(
        { error: 'flightLogId and projectName are required' },
        { status: 400 }
      );
    }

    // Fetch flight log to get photo data points
    const flightLog = await fetchFlightLog(flightLogId, authenticatedClient);
    
    if (!flightLog) {
      return NextResponse.json(
        { error: 'Flight log not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    const { data: logCheck } = await authenticatedClient
      .from('flight_logs')
      .select('owner_id')
      .eq('id', flightLogId)
      .single();

    if (!logCheck || logCheck.owner_id !== user.id) {
      return NextResponse.json(
        { error: 'Flight log not found or access denied' },
        { status: 403 }
      );
    }

    // Get photos from flight log
    const photos = flightLog.dataPoints?.filter(dp => dp.isPhoto && dp.originalFileUrl) || [];

    if (photos.length === 0) {
      return NextResponse.json(
        { error: 'No photos found in flight log. Please ensure photos are matched to the flight.' },
        { status: 400 }
      );
    }

    // Calculate area bounds from photo locations
    const photoLats = photos.map(p => p.lat).filter((lat): lat is number => lat !== undefined);
    const photoLngs = photos.map(p => p.lng).filter((lng): lng is number => lng !== undefined);

    if (photoLats.length === 0 || photoLngs.length === 0) {
      return NextResponse.json(
        { error: 'Photos do not have GPS coordinates' },
        { status: 400 }
      );
    }

    const area = {
      north: Math.max(...photoLats),
      south: Math.min(...photoLats),
      east: Math.max(...photoLngs),
      west: Math.min(...photoLngs),
    };

    // Create orthomosaic project record
    const { createOrthomosaicProject } = await import('@/lib/supabase');
    const project = await createOrthomosaicProject({
      name: projectName,
      missionId: undefined,
      flightLogId,
      status: 'pending',
      area,
      photoCount: photos.length,
    });

    // Update status to processing
    const { updateOrthomosaicProject } = await import('@/lib/supabase');
    await updateOrthomosaicProject(project.id, {
      status: 'processing',
      processingStartedAt: new Date().toISOString(),
    });

    // NOTE: Photo files are stored on the user's local file system.
    // We have two options:
    // 1. Client-side processing (user's machine runs ODM)
    // 2. Upload photos to Supabase Storage first, then process server-side
    //
    // For now, we'll return the project with photo file paths.
    // The client can then either:
    // - Upload photos to Supabase Storage and trigger server-side processing
    // - Or use a local ODM installation

    // Extract photo file paths from originalFileUrl
    const photoPaths = photos
      .map(p => p.originalFileUrl)
      .filter((path): path is string => !!path);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      message: 'Orthomosaic project created. Ready for processing.',
      photoCount: photos.length,
      photoPaths, // Return paths for client-side processing or upload
      area,
      note: 'Photos are stored locally. For server-side processing, upload photos to Supabase Storage first.',
    });
  } catch (error) {
    console.error('Error processing orthomosaic:', error);
    return NextResponse.json(
      {
        error: 'Failed to process orthomosaic',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

