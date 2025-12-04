import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { recalculateAllBatteryStats } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 300; // Allow up to 5 minutes for recalculation

/**
 * API route to recalculate all battery statistics
 * POST /api/recalculate-battery-stats
 */
export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Create a Supabase client for auth verification
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    let user;
    
    // Try cookie-based auth first (more reliable in Next.js)
    try {
      const serverSupabase = await createServerSupabaseClient();
      const { data: { user: userFromSession }, error: authError } = await serverSupabase.auth.getUser();
      if (!authError && userFromSession) {
        user = userFromSession;
        console.log('Authenticated via cookies:', user.id);
      } else {
        console.error('Cookie auth failed:', authError?.message || 'No user');
      }
    } catch (cookieError) {
      console.error('Error reading session from cookies:', cookieError);
    }
    
    // Fallback: try token from Authorization header
    if (!user && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user: userFromToken }, error } = await supabase.auth.getUser(token);
        if (!error && userFromToken) {
          user = userFromToken;
          console.log('Authenticated via token:', user.id);
        }
      } catch (tokenError) {
        console.error('Error authenticating with token:', tokenError);
      }
    }
    
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in and try again.' },
        { status: 401 }
      );
    }
    
    // Create authenticated client for database operations
    let authenticatedClient;
    try {
      authenticatedClient = await createServerSupabaseClient();
      
      // Verify the client can access user data (RLS check)
      const { data: { user: verifiedUser }, error: verifyError } = await authenticatedClient.auth.getUser();
      if (verifyError || !verifiedUser || verifiedUser.id !== user.id) {
        // Try token-based auth as fallback
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (token) {
          const { createAuthenticatedSupabaseClient } = await import('@/lib/supabase-server');
          authenticatedClient = await createAuthenticatedSupabaseClient(token);
          console.log('Using token-based authenticated client for battery stats recalculation');
        } else {
          throw new Error('Failed to verify authentication and no token available');
        }
      } else {
        console.log('Using cookie-based authenticated client for battery stats recalculation');
      }
    } catch (authError) {
      console.error('Failed to create authenticated client:', authError);
      return NextResponse.json(
        { error: `Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}` },
        { status: 401 }
      );
    }

    console.log(`Starting battery stats recalculation for user ${user.id}...`);
    
    await recalculateAllBatteryStats(authenticatedClient, user.id);
    
    console.log('Battery stats recalculation completed successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Battery statistics recalculated successfully',
    });
  } catch (error) {
    console.error('Error recalculating battery stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to recalculate battery statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

