import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Schema configuration for multi-project database setup
const DB_SCHEMA = 'drone';

/**
 * Create a Supabase client authenticated with an access token
 * This is used for API routes where we have the user's access token
 * The client will include the Authorization header in all requests for RLS
 */
export async function createAuthenticatedSupabaseClient(accessToken: string): Promise<SupabaseClient> {
  // Verify the token first by getting the user
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: DB_SCHEMA },
  });
  const { data: { user }, error: userError } = await tempClient.auth.getUser(accessToken);
  
  if (userError || !user) {
    throw new Error(`Invalid access token: ${userError?.message || 'Unknown error'}`);
  }
  
  // Create client with the token in headers for all requests
  // Supabase Postgres uses the Authorization header for RLS JWT verification
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: DB_SCHEMA,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Set the session so RLS can extract auth.uid() from the JWT
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
  
  // Set the session in the client so it knows about the user
  // This helps RLS policies work correctly
  try {
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // Not needed for server-side, but required by setSession
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    } as any);
  } catch (sessionError) {
    // If setSession fails, that's okay - the Authorization header in global.headers
    // should still work for RLS since Postgres checks the JWT from headers
    console.warn('Could not set session, but Authorization header should still work for RLS:', sessionError);
  }
  
  return client;
}

/**
 * Create a Supabase client for server-side operations (API routes, server components)
 * For API routes, we primarily use token-based auth from Authorization header
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  try {
    // Try to use cookies for session management if available
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();

    // Create client with cookie-based auth
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: DB_SCHEMA,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options || {});
          });
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    return client;
  } catch (error) {
    // Fallback: create basic client without cookie support
    console.warn('Could not create Supabase client with cookies, using basic client:', error);
    return createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: DB_SCHEMA,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
}

/**
 * Check if a flight log with the given filename already exists for a user
 */
export async function checkFlightLogExistsWithClient(
  supabase: SupabaseClient,
  ownerId: string,
  filename: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('flight_logs')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('filename', filename)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data && data.length > 0) || false;
}

/**
 * Register or update a drone in the fleet from flight log metadata
 */
export async function registerDroneFromLog(
  supabase: SupabaseClient,
  ownerId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const droneSerialNumber = metadata.droneSerialNumber as string | undefined;
  const droneModel = metadata.droneModel as string | undefined;

  // Only proceed if we have a serial number
  if (!droneSerialNumber || typeof droneSerialNumber !== 'string') {
    return; // No drone serial number found, skip
  }

  // Check if drone already exists
  const { data: existingDrone, error: checkError } = await supabase
    .from('fleet_drones')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('serial_number', droneSerialNumber)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    // Error other than "not found", log it but don't fail
    console.error('Error checking for existing drone:', checkError);
    return;
  }

  if (existingDrone) {
    // Update last_seen timestamp
    await supabase
      .from('fleet_drones')
      .update({ 
        last_seen: new Date().toISOString(),
        ...(droneModel && !existingDrone.model ? { model: droneModel } : {}),
      })
      .eq('id', existingDrone.id);
  } else {
    // Insert new drone
    const { error: insertError } = await supabase
      .from('fleet_drones')
      .insert({
        owner_id: ownerId,
        serial_number: droneSerialNumber,
        model: droneModel || null,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error inserting new drone:', insertError);
      // Don't throw - we don't want to fail log import if drone registration fails
    }
  }
}

/**
 * Save flight log using a server-side Supabase client
 */
export async function saveFlightLogWithClient(
  supabase: SupabaseClient,
  ownerId: string,
  flightLog: Partial<import('./types').FlightLog>
) {
  const { flightLogToDB } = await import('./supabase');
  
  console.log('Converting flight log to DB format...');
  console.log('Flight log has data points:', flightLog.dataPoints?.length || 0);
  
  const { flightLog: flightLogData, dataPoints: dataPointsData } = flightLogToDB(flightLog, ownerId);
  
  console.log('Converted to DB format:', {
    flightLogKeys: Object.keys(flightLogData),
    dataPointsCount: dataPointsData.length,
  });

  // Verify we can access the user's data (RLS check)
  const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
  if (userError || !currentUser || currentUser.id !== ownerId) {
    console.error('RLS check failed:', {
      userError,
      currentUser: currentUser?.id,
      ownerId,
      match: currentUser?.id === ownerId,
    });
    throw new Error('Not authorized to save flight log');
  }

  // Create flight log
  const { data: newFlightLog, error: flightLogError } = await supabase
    .from('flight_logs')
    .insert({ ...flightLogData, owner_id: ownerId })
    .select()
    .single();

  if (flightLogError) {
    console.error('Error inserting flight log:', {
      message: flightLogError.message,
      details: flightLogError.details,
      hint: flightLogError.hint,
      code: flightLogError.code,
      dataKeys: Object.keys(flightLogData),
    });
    throw new Error(`Database error inserting flight log: ${flightLogError.message}${flightLogError.details ? ` (${flightLogError.details})` : ''}${flightLogError.hint ? ` Hint: ${flightLogError.hint}` : ''}`);
  }

  // Insert data points in batches to avoid hitting limits
  console.log(`Inserting ${dataPointsData.length} data points...`);
  if (dataPointsData.length === 0) {
    console.warn('No data points to insert - flight log will be saved without track data');
  } else {
    const batchSize = 1000;
    let insertedCount = 0;
    let photoFilenameSupported = true; // Track if photo_filename column exists
    
    for (let i = 0; i < dataPointsData.length; i += batchSize) {
      const batch = dataPointsData.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} points)...`);
      
      // Prepare batch for insertion
      let batchToInsert = batch.map(dp => ({ ...dp, flight_log_id: newFlightLog.id }));
      
      // If photo_filename column doesn't exist, remove it from the insert
      if (!photoFilenameSupported) {
        batchToInsert = batchToInsert.map(({ photo_filename, ...rest }) => rest);
      }
      
      const { error: dpError } = await supabase
        .from('flight_log_data_points')
        .insert(batchToInsert);

      if (dpError) {
        // Check if error is due to missing photo_filename column
        if (photoFilenameSupported && (
          dpError.message?.includes('photo_filename') || 
          dpError.details?.includes('photo_filename') ||
          dpError.code === '42703' // undefined_column error code
        )) {
          console.warn('photo_filename column not found, retrying without it. Please run migration 003_add_photo_filename.sql');
          photoFilenameSupported = false;
          
          // Retry this batch without photo_filename
          const retryBatch = batch.map(({ photo_filename, ...rest }) => ({ ...rest, flight_log_id: newFlightLog.id }));
          const { error: retryError } = await supabase
            .from('flight_log_data_points')
            .insert(retryBatch);
          
          if (retryError) {
            console.error('Error inserting data points batch (retry without photo_filename):', {
              message: retryError.message,
              details: retryError.details,
              hint: retryError.hint,
              code: retryError.code,
            });
            throw new Error(`Database error inserting data points: ${retryError.message}${retryError.details ? ` (${retryError.details})` : ''}`);
          }
          insertedCount += batch.length;
          continue;
        }
        
        console.error('Error inserting data points batch:', {
          message: dpError.message,
          details: dpError.details,
          hint: dpError.hint,
          code: dpError.code,
          batchSize: batch.length,
        });
        throw new Error(`Database error inserting data points: ${dpError.message}${dpError.details ? ` (${dpError.details})` : ''}${dpError.hint ? ` Hint: ${dpError.hint}` : ''}`);
      }
      insertedCount += batch.length;
    }
    console.log(`Successfully inserted ${insertedCount} data points`);
  }

  // Save warnings and errors if any
  const warnings = flightLog.warnings || [];
  const errors = flightLog.errors || [];
  const allIssues = [...warnings, ...errors];
  
  if (allIssues.length > 0) {
    console.log(`Saving ${allIssues.length} warnings/errors...`);
    const issuesToInsert = allIssues.map(issue => ({
      flight_log_id: newFlightLog.id,
      severity: issue.severity,
      category: issue.category,
      message: issue.message,
      timestamp_offset_ms: issue.timestampOffsetMs || null,
      details: issue.details || null,
    }));
    
    const { error: issuesError } = await supabase
      .from('flight_log_warnings_errors')
      .insert(issuesToInsert);
    
    if (issuesError) {
      console.error('Error inserting warnings/errors:', issuesError);
      // Don't fail the import if warnings/errors save fails
    } else {
      console.log(`Successfully inserted ${allIssues.length} warnings/errors`);
    }
  }

  return newFlightLog.id;
}

/**
 * Recalculate all battery statistics for a user and save to cache
 * This performs the full calculation and updates the battery_stats table
 */
export async function recalculateAllBatteryStats(
  supabase: SupabaseClient,
  ownerId: string
): Promise<void> {
  console.log(`Starting battery stats recalculation for user ${ownerId}...`);

  // Fetch all flight logs
  const { data: flightLogs, error: logsError } = await supabase
    .from('flight_logs')
    .select('id, flight_date, duration_seconds, total_distance_m, metadata, battery_start_percent, battery_end_percent')
    .eq('owner_id', ownerId)
    .order('flight_date', { ascending: true });

  if (logsError) throw logsError;

  const statsMap = new Map<string, {
    serialNumber: string;
    flightCount: number;
    totalFlightTimeSeconds: number;
    totalDistanceM: number;
    batteryUsageSamples: number;
    totalBatteryUsagePercent: number;
    totalBatteryStartPercent: number;
    totalBatteryEndPercent: number;
    batteryStartSamples: number;
    batteryEndSamples: number;
    firstFlightDate?: string;
    lastFlightDate?: string;
    voltageSamples: number[];
    temperatureSamples: number[];
    cellDeviationSamples: number[];
    fullCapacity?: number;
  }>();

  // Aggregate flight statistics
  (flightLogs || []).forEach((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const serial = metadata?.batterySerialNumber as string | undefined;
    if (!serial) {
      return;
    }

    const duration = typeof log.duration_seconds === 'number' && log.duration_seconds > 0 
      ? log.duration_seconds 
      : 0;
    const distance = typeof log.total_distance_m === 'number' && log.total_distance_m > 0
      ? log.total_distance_m
      : 0;
    const batteryStart = typeof log.battery_start_percent === 'number' ? log.battery_start_percent : undefined;
    const batteryEnd = typeof log.battery_end_percent === 'number' ? log.battery_end_percent : undefined;

    if (!statsMap.has(serial)) {
      statsMap.set(serial, {
        serialNumber: serial,
        flightCount: 0,
        totalFlightTimeSeconds: 0,
        totalDistanceM: 0,
        batteryUsageSamples: 0,
        totalBatteryUsagePercent: 0,
        totalBatteryStartPercent: 0,
        totalBatteryEndPercent: 0,
        batteryStartSamples: 0,
        batteryEndSamples: 0,
        firstFlightDate: log.flight_date || undefined,
        lastFlightDate: log.flight_date || undefined,
        voltageSamples: [],
        temperatureSamples: [],
        cellDeviationSamples: [],
      });
    }

    const entry = statsMap.get(serial)!;
    entry.flightCount += 1;
    
    if (duration > 0) {
      entry.totalFlightTimeSeconds += duration;
    }
    if (distance > 0) {
      entry.totalDistanceM += distance;
    }

    if (batteryStart !== undefined) {
      entry.totalBatteryStartPercent += batteryStart;
      entry.batteryStartSamples += 1;
    }
    if (batteryEnd !== undefined) {
      entry.totalBatteryEndPercent += batteryEnd;
      entry.batteryEndSamples += 1;
    }
    if (batteryStart !== undefined && batteryEnd !== undefined) {
      entry.totalBatteryUsagePercent += (batteryStart - batteryEnd);
      entry.batteryUsageSamples += 1;
    }

    if (log.flight_date) {
      if (!entry.firstFlightDate || log.flight_date < entry.firstFlightDate) {
        entry.firstFlightDate = log.flight_date;
      }
      if (!entry.lastFlightDate || log.flight_date > entry.lastFlightDate) {
        entry.lastFlightDate = log.flight_date;
      }
    }
  });

  // Fetch battery health data from sample data points
  const logIdsBySerial = new Map<string, string[]>();
  (flightLogs || []).forEach((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const serial = metadata?.batterySerialNumber as string | undefined;
    if (serial && log.id) {
      if (!logIdsBySerial.has(serial)) {
        logIdsBySerial.set(serial, []);
      }
      logIdsBySerial.get(serial)!.push(log.id);
    }
  });

  // Fetch sample battery health data points
  for (const [serial, logIds] of logIdsBySerial.entries()) {
    if (!statsMap.has(serial)) continue;
    
    const entry = statsMap.get(serial)!;
    
    for (const logId of logIds) {
      const { data: sampleDataPoints, error: dpError } = await supabase
        .from('flight_log_data_points')
        .select('battery_voltage, battery_temperature, battery_cell_voltage_deviation, battery_full_capacity')
        .eq('flight_log_id', logId)
        .not('battery_voltage', 'is', null)
        .limit(30);
      
      if (!dpError && sampleDataPoints) {
        sampleDataPoints.forEach((dp: any) => {
          if (dp.battery_voltage !== null && typeof dp.battery_voltage === 'number') {
            entry.voltageSamples.push(dp.battery_voltage);
          }
          if (dp.battery_temperature !== null && typeof dp.battery_temperature === 'number') {
            entry.temperatureSamples.push(dp.battery_temperature);
          }
          if (dp.battery_cell_voltage_deviation !== null && typeof dp.battery_cell_voltage_deviation === 'number') {
            entry.cellDeviationSamples.push(dp.battery_cell_voltage_deviation);
          }
          if (dp.battery_full_capacity !== null && typeof dp.battery_full_capacity === 'number' && !entry.fullCapacity) {
            entry.fullCapacity = dp.battery_full_capacity;
          }
        });
      }
    }
  }

  // Calculate aggregates and prepare for database insertion
  const statsToUpsert = Array.from(statsMap.values()).map((entry) => {
    const voltageSamples = entry.voltageSamples || [];
    const temperatureSamples = entry.temperatureSamples || [];
    const cellDeviationSamples = entry.cellDeviationSamples || [];

    return {
      owner_id: ownerId,
      battery_serial_number: entry.serialNumber,
      flight_count: entry.flightCount,
      total_flight_time_seconds: entry.totalFlightTimeSeconds,
      total_distance_m: entry.totalDistanceM,
      total_battery_usage_percent: entry.batteryUsageSamples > 0 ? entry.totalBatteryUsagePercent : null,
      battery_usage_samples: entry.batteryUsageSamples,
      total_battery_start_percent: entry.batteryStartSamples > 0 ? entry.totalBatteryStartPercent : null,
      battery_start_samples: entry.batteryStartSamples,
      total_battery_end_percent: entry.batteryEndSamples > 0 ? entry.totalBatteryEndPercent : null,
      battery_end_samples: entry.batteryEndSamples,
      avg_voltage: voltageSamples.length > 0 ? voltageSamples.reduce((a, b) => a + b, 0) / voltageSamples.length : null,
      min_voltage: voltageSamples.length > 0 ? Math.min(...voltageSamples) : null,
      max_voltage: voltageSamples.length > 0 ? Math.max(...voltageSamples) : null,
      avg_temperature: temperatureSamples.length > 0 ? temperatureSamples.reduce((a, b) => a + b, 0) / temperatureSamples.length : null,
      min_temperature: temperatureSamples.length > 0 ? Math.min(...temperatureSamples) : null,
      max_temperature: temperatureSamples.length > 0 ? Math.max(...temperatureSamples) : null,
      avg_cell_deviation: cellDeviationSamples.length > 0 ? cellDeviationSamples.reduce((a, b) => a + b, 0) / cellDeviationSamples.length : null,
      max_cell_deviation: cellDeviationSamples.length > 0 ? Math.max(...cellDeviationSamples) : null,
      full_capacity: entry.fullCapacity || null,
      first_flight_date: entry.firstFlightDate || null,
      last_flight_date: entry.lastFlightDate || null,
      last_calculated_at: new Date().toISOString(),
    };
  });

  // Delete existing stats for this user and insert new ones
  // (Using upsert would be better but requires unique constraint which we have)
  const { error: deleteError } = await supabase
    .from('battery_stats')
    .delete()
    .eq('owner_id', ownerId);

  if (deleteError) {
    console.warn('Error deleting old battery stats (may not exist yet):', deleteError);
    // Continue anyway - upsert will handle it
  }

  if (statsToUpsert.length > 0) {
    const { error: insertError } = await supabase
      .from('battery_stats')
      .insert(statsToUpsert);

    if (insertError) {
      throw new Error(`Failed to save battery stats: ${insertError.message}`);
    }
    console.log(`Successfully recalculated and cached stats for ${statsToUpsert.length} battery(ies)`);
  } else {
    console.log('No battery stats to cache (no batteries found in flight logs)');
  }
}

