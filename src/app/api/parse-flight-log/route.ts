import { NextRequest, NextResponse } from 'next/server';
import { parseDJILogWithCLI } from '@/lib/dji-log-parser-cli';
import { createServerSupabaseClient, saveFlightLogWithClient, checkFlightLogExistsWithClient } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs'; // Ensure we can use Node.js APIs
export const maxDuration = 60; // Allow up to 60 seconds for parsing

/**
 * API route to parse DJI flight log files using dji-log-parser CLI tool
 * POST /api/parse-flight-log
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Starting flight log parse request...');
    
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
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
      console.log('Trying cookie-based auth...');
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
      console.log('Trying to authenticate with token from header...');
      try {
        const { data: { user: userFromToken }, error } = await supabase.auth.getUser(token);
        if (!error && userFromToken) {
          user = userFromToken;
          console.log('Authenticated via token:', user.id);
        } else {
          console.error('Token auth failed:', error?.message || 'Unknown error');
        }
      } catch (tokenError) {
        console.error('Error authenticating with token:', tokenError);
      }
    }
    
    // If still no user, return error
    if (!user) {
      console.error('No user authenticated. Auth header present:', !!authHeader);
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in and try again.' },
        { status: 401 }
      );
    }

    // Get the file from form data
    console.log('Reading form data...');
    let formData: FormData;
    try {
      formData = await request.formData();
      console.log('Form data read successfully');
    } catch (formError) {
      console.error('Error reading form data:', formError);
      return NextResponse.json(
        { error: 'Failed to read file upload' },
        { status: 400 }
      );
    }
    
    const file = formData.get('file');
    
    if (!file) {
      console.error('No file in form data');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Handle file - could be File object or Blob
    let filename: string;
    let buffer: Buffer;
    
    try {
      if (file instanceof File) {
        filename = file.name;
        console.log('File received:', filename, 'size:', file.size);
        
        // Validate file type
        if (!filename.match(/DJIFlightRecord_\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\]\.txt$/)) {
          console.error('Invalid file name format:', filename);
          return NextResponse.json(
            { error: 'Invalid file format. Expected DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt' },
            { status: 400 }
          );
        }
        
        // Check if this file has already been uploaded
        console.log('Checking for duplicate log file...');
        try {
          // Create a temporary client to check for duplicates
          const serverSupabase = await createServerSupabaseClient();
          const duplicateExists = await checkFlightLogExistsWithClient(serverSupabase, user.id, filename);
          
          if (duplicateExists) {
            console.log('Duplicate file detected:', filename);
            return NextResponse.json(
              { 
                error: 'This flight log has already been uploaded.',
                duplicate: true,
                filename: filename,
              },
              { status: 409 } // 409 Conflict
            );
          }
          console.log('No duplicate found, proceeding with upload...');
        } catch (checkError) {
          // If we can't check (auth issue), log but continue - we'll fail later anyway
          console.warn('Could not check for duplicates, proceeding anyway:', checkError);
        }

        // Convert File to Buffer for processing
        console.log('Converting File to buffer...');
        try {
          const arrayBuffer = await file.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          console.log('File converted to buffer, size:', buffer.length);
        } catch (bufferError) {
          console.error('Error converting file to buffer:', bufferError);
          throw new Error(`Failed to read file: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
        }
      } else if (file instanceof Blob) {
        // Handle Blob
        filename = (file as any).name || 'flight-log.txt';
        console.log('Blob received, size:', file.size);
        
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        // Handle as FormDataEntryValue - convert to string and validate
        console.error('Unknown file type:', typeof file, Object.keys(file || {}));
        return NextResponse.json(
          { error: 'Invalid file format' },
          { status: 400 }
        );
      }
      
      if (!buffer || buffer.length === 0) {
        throw new Error('File buffer is empty');
      }
      
      console.log('Buffer created successfully, size:', buffer.length);
    } catch (fileError) {
      console.error('Error processing file:', fileError);
      const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
      const errorStack = fileError instanceof Error ? fileError.stack : undefined;
      console.error('File error stack:', errorStack);
      
      return NextResponse.json(
        { 
          error: `Error processing file: ${errorMessage}`,
          details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        },
        { status: 500 }
      );
    }

    // Parse the log file using CLI tool
    console.log('Starting parse...');
    const result = await parseDJILogWithCLI(buffer, filename);
    console.log('Parse result:', result.success ? 'success' : 'failed', result.error);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to parse log file',
          needsCLITool: result.error?.includes('dji-log-parser CLI tool'),
        },
        { status: 500 }
      );
    }

    // Check if we have data points
    const dataPointCount = result.flightLog?.dataPoints?.length || 0;
    console.log(`Parsed flight log with ${dataPointCount} data points`);
    
    if (dataPointCount === 0) {
      console.warn('No data points found in parsed log file');
      // Still allow saving, but with a warning
    }

    // Create authenticated Supabase client for database operations
    console.log('Creating authenticated Supabase client for database operations...');
    
    // Try to use cookie-based client first (more reliable for RLS in Next.js)
    let authenticatedClient: SupabaseClient;
    
    try {
      // Use server client with cookies - this should work for RLS
      authenticatedClient = await createServerSupabaseClient();
      
      // Verify the client can access the user (RLS check)
      const { data: { user: verifiedUser }, error: verifyError } = await authenticatedClient.auth.getUser();
      if (verifyError || !verifiedUser || verifiedUser.id !== user.id) {
        console.warn('Cookie-based client verification failed, trying token-based:', {
          verifyError: verifyError?.message,
          verifiedUser: verifiedUser?.id,
          expectedUser: user.id,
        });
        
        // Fallback to token-based auth
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (!token) {
          throw new Error('No access token available for database operations');
        }
        
        const { createAuthenticatedSupabaseClient } = await import('@/lib/supabase-server');
        authenticatedClient = await createAuthenticatedSupabaseClient(token);
        
        // Verify token-based client
        const { data: { user: tokenUser }, error: tokenError } = await authenticatedClient.auth.getUser();
        if (tokenError || !tokenUser || tokenUser.id !== user.id) {
          throw new Error('Failed to verify user with token-based client');
        }
        console.log('Using token-based authenticated client');
      } else {
        console.log('Using cookie-based authenticated client');
      }
    } catch (authError) {
      console.error('Failed to create authenticated client:', authError);
      return NextResponse.json(
        { error: `Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}` },
        { status: 401 }
      );
    }
    
    // Save to database using authenticated client
    console.log('Saving flight log to database...');
    try {
      const flightLogId = await saveFlightLogWithClient(authenticatedClient, user.id, result.flightLog);
      console.log('Saved to database successfully, ID:', flightLogId);
      
      // Register/update drone in fleet if metadata contains drone info
      if (result.flightLog.metadata) {
        try {
          const { registerDroneFromLog } = await import('@/lib/supabase-server');
          await registerDroneFromLog(authenticatedClient, user.id, result.flightLog.metadata);
          console.log('Drone registered/updated in fleet');
        } catch (droneError) {
          // Log but don't fail - drone registration is non-critical
          console.warn('Failed to register drone in fleet (non-critical):', droneError);
        }
      }

      // Battery stats will be recalculated once at the end of all uploads (bulk operation)
      
      return NextResponse.json({
        success: true,
        flightLogId,
        flightLog: result.flightLog,
        dataPointsCount: result.flightLog.dataPoints?.length || 0,
      });
    } catch (saveError) {
      console.error('Failed to save flight log:', saveError);
      return NextResponse.json(
        { 
          error: `Failed to save flight log: ${saveError instanceof Error ? saveError.message : 'Unknown error'}` 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('===== ERROR PARSING FLIGHT LOG =====');
    console.error('Error:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : undefined;
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: errorMessage,
      name: errorName,
      stack: errorStack,
      error: String(error),
    });
    console.error('=====================================');
    
    return NextResponse.json(
      { 
        error: errorMessage,
        errorType: errorName,
        details: process.env.NODE_ENV === 'development' 
          ? {
              message: errorMessage,
              stack: errorStack,
              type: errorName,
            }
          : undefined,
      },
      { status: 500 }
    );
  }
}

