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

    // Delete all photo data points for this flight log
    const { error: deleteError } = await authenticatedClient
      .from('flight_log_data_points')
      .delete()
      .eq('flight_log_id', flightLogId)
      .eq('is_photo', true);

    if (deleteError) {
      console.error('Error deleting photo data points:', deleteError);
      return NextResponse.json(
        { error: `Failed to delete photo data points: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'All photo data points deleted successfully',
    });
  } catch (error) {
    console.error('Error in delete-photos API:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete photo data points',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

