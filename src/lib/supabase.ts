import { createClient } from '@supabase/supabase-js';
import { Mission, Waypoint, MissionDB, WaypointDB, FlightLog, FlightLogDataPoint, FlightLogDB, FlightLogDataPointDB, BatteryStats, BatteryLabel, BatteryLabelDB, Drone, DroneDB, FlightLogWarningErrorDB, OrthomosaicProject, OrthomosaicProjectDB } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Convert DB format to frontend format
export function missionFromDB(mission: MissionDB, waypoints: WaypointDB[]): Mission {
  const metadata = (mission.metadata || {}) as Record<string, unknown>;
  
  const result: Mission = {
    id: mission.id,
    name: mission.name,
    description: mission.description || undefined,
    droneModel: mission.drone_model,
    missionType: (mission.mission_type || 'waypoint') as 'waypoint' | 'mapping',
    homeLocation: mission.home_lat && mission.home_lng
      ? { lat: mission.home_lat, lng: mission.home_lng }
      : undefined,
    defaultAltitudeM: mission.default_altitude_m,
    defaultSpeedMps: mission.default_speed_mps,
    waypoints: waypoints
      .sort((a, b) => a.index - b.index)
      .map(wp => ({
        id: wp.id,
        index: wp.index,
        lat: wp.lat,
        lng: wp.lng,
        altitudeM: wp.altitude_m || undefined,
        speedMps: wp.speed_mps || undefined,
        headingDeg: wp.heading_deg || undefined,
        gimbalPitchDeg: wp.gimbal_pitch_deg || undefined,
        actionType: wp.action_type || undefined,
        actionPayload: wp.action_payload || undefined,
      })),
    createdAt: mission.created_at,
    updatedAt: mission.updated_at,
  };

  // Add mapping-specific fields if this is a mapping mission
  if (result.missionType === 'mapping' && metadata) {
    if (metadata.mapping_area) {
      result.mappingArea = metadata.mapping_area as Mission['mappingArea'];
    }
    if (metadata.overlap) {
      result.overlap = metadata.overlap as Mission['overlap'];
    }
    if (metadata.grid_settings) {
      result.gridSettings = metadata.grid_settings as Mission['gridSettings'];
    }
    if (metadata.processing_settings) {
      result.processingSettings = metadata.processing_settings as Mission['processingSettings'];
    }
  }

  return result;
}

// Convert frontend format to DB format
export function missionToDB(mission: Mission, ownerId: string) {
  // Build metadata for mapping missions
  const metadata: Record<string, unknown> = {};
  
  if (mission.missionType === 'mapping') {
    if (mission.mappingArea) {
      metadata.mapping_area = mission.mappingArea;
    }
    if (mission.overlap) {
      metadata.overlap = mission.overlap;
    }
    if (mission.gridSettings) {
      metadata.grid_settings = mission.gridSettings;
    }
    if (mission.processingSettings) {
      metadata.processing_settings = mission.processingSettings;
    }
  }

  return {
    mission: {
      name: mission.name,
      description: mission.description || null,
      drone_model: mission.droneModel,
      mission_type: mission.missionType || 'waypoint',
      home_lat: mission.homeLocation?.lat || null,
      home_lng: mission.homeLocation?.lng || null,
      default_altitude_m: mission.defaultAltitudeM,
      default_speed_mps: mission.defaultSpeedMps,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    },
    waypoints: mission.waypoints.map(wp => ({
      index: wp.index,
      lat: wp.lat,
      lng: wp.lng,
      altitude_m: wp.altitudeM || null,
      speed_mps: wp.speedMps || null,
      heading_deg: wp.headingDeg || null,
      gimbal_pitch_deg: wp.gimbalPitchDeg || null,
      action_type: wp.actionType || null,
      action_payload: wp.actionPayload || null,
    })),
  };
}

// Fetch all missions for current user
export async function fetchMissions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: missions, error } = await supabase
    .from('missions')
    .select('*')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  // Fetch waypoints for each mission
  const missionsWithWaypoints = await Promise.all(
    missions.map(async (mission) => {
      const { data: waypoints, error: wpError } = await supabase
        .from('mission_waypoints')
        .select('*')
        .eq('mission_id', mission.id)
        .order('index', { ascending: true });

      if (wpError) throw wpError;
      return missionFromDB(mission as MissionDB, (waypoints || []) as WaypointDB[]);
    })
  );

  return missionsWithWaypoints;
}

// Fetch single mission
export async function fetchMission(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: mission, error } = await supabase
    .from('missions')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (error) throw error;

  const { data: waypoints, error: wpError } = await supabase
    .from('mission_waypoints')
    .select('*')
    .eq('mission_id', id)
    .order('index', { ascending: true });

  if (wpError) throw wpError;
  return missionFromDB(mission as MissionDB, (waypoints || []) as WaypointDB[]);
}

// Save mission (create or update)
export async function saveMission(mission: Mission) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { mission: missionData, waypoints: waypointsData } = missionToDB(mission, user.id);

  if (mission.id) {
    // Update existing mission
    const { error: missionError } = await supabase
      .from('missions')
      .update(missionData)
      .eq('id', mission.id)
      .eq('owner_id', user.id);

    if (missionError) throw missionError;

    // Delete existing waypoints
    const { error: deleteError } = await supabase
      .from('mission_waypoints')
      .delete()
      .eq('mission_id', mission.id);

    if (deleteError) throw deleteError;
  } else {
    // Create new mission
    const { data: newMission, error: missionError } = await supabase
      .from('missions')
      .insert({ ...missionData, owner_id: user.id })
      .select()
      .single();

    if (missionError) throw missionError;
    mission.id = newMission.id;
  }

  // Insert waypoints
  if (waypointsData.length > 0) {
    const { error: wpError } = await supabase
      .from('mission_waypoints')
      .insert(
        waypointsData.map(wp => ({ ...wp, mission_id: mission.id }))
      );

    if (wpError) throw wpError;
  }

  return mission;
}

// Delete mission
export async function deleteMission(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('missions')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw error;
}

// Flight Log Functions

// Convert DB format to frontend format
export function flightLogFromDB(
  flightLog: FlightLogDB, 
  dataPoints: FlightLogDataPointDB[],
  warningsErrors: FlightLogWarningErrorDB[] = []
): FlightLog {
  const warnings = warningsErrors.filter(we => we.severity === 'warning').map(we => ({
    id: we.id,
    severity: we.severity,
    category: we.category,
    message: we.message,
    timestampOffsetMs: we.timestamp_offset_ms || undefined,
    details: we.details || undefined,
  }));
  
  const errors = warningsErrors.filter(we => we.severity === 'error').map(we => ({
    id: we.id,
    severity: we.severity,
    category: we.category,
    message: we.message,
    timestampOffsetMs: we.timestamp_offset_ms || undefined,
    details: we.details || undefined,
  }));
  
  return {
    id: flightLog.id,
    filename: flightLog.filename,
    flightDate: flightLog.flight_date || undefined,
    droneModel: flightLog.drone_model || undefined,
    durationSeconds: flightLog.duration_seconds || undefined,
    maxAltitudeM: flightLog.max_altitude_m || undefined,
    maxDistanceM: flightLog.max_distance_m || undefined,
    homeLocation: flightLog.home_lat && flightLog.home_lng
      ? { lat: flightLog.home_lat, lng: flightLog.home_lng }
      : undefined,
    startLocation: flightLog.start_lat && flightLog.start_lng
      ? { lat: flightLog.start_lat, lng: flightLog.start_lng }
      : undefined,
    endLocation: flightLog.end_lat && flightLog.end_lng
      ? { lat: flightLog.end_lat, lng: flightLog.end_lng }
      : undefined,
    totalDistanceM: flightLog.total_distance_m || undefined,
    maxSpeedMps: flightLog.max_speed_mps || undefined,
    batteryStartPercent: flightLog.battery_start_percent || undefined,
    batteryEndPercent: flightLog.battery_end_percent || undefined,
    metadata: flightLog.metadata || undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
    createdAt: flightLog.created_at,
    updatedAt: flightLog.updated_at,
    dataPoints: dataPoints
      .sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms)
      .map(dp => ({
        id: dp.id,
        timestampOffsetMs: dp.timestamp_offset_ms,
        lat: dp.lat || undefined,
        lng: dp.lng || undefined,
        altitudeM: dp.altitude_m || undefined,
        speedMps: dp.speed_mps || undefined,
        headingDeg: dp.heading_deg || undefined,
        gimbalPitchDeg: dp.gimbal_pitch_deg || undefined,
        batteryPercent: dp.battery_percent || undefined,
        batteryVoltage: dp.battery_voltage || undefined,
        batteryCurrent: dp.battery_current || undefined,
        batteryTemperature: dp.battery_temperature || undefined,
        batteryMinTemperature: dp.battery_min_temperature || undefined,
        batteryMaxTemperature: dp.battery_max_temperature || undefined,
        batteryCellVoltages: dp.battery_cell_voltages || undefined,
        batteryCellVoltageDeviation: dp.battery_cell_voltage_deviation || undefined,
        batteryCurrentCapacity: dp.battery_current_capacity || undefined,
        batteryFullCapacity: dp.battery_full_capacity || undefined,
        signalStrength: dp.signal_strength || undefined,
        satelliteCount: dp.satellite_count || undefined,
        isPhoto: dp.is_photo || false,
        photoFilename: dp.photo_filename || undefined,
        thumbnailUrl: dp.thumbnail_url || undefined,
        originalFileUrl: dp.original_file_url || undefined,
        isVideoRecording: dp.is_video_recording || false,
        rawData: dp.raw_data || undefined,
      })),
  };
}

// Convert frontend format to DB format
export function flightLogToDB(flightLog: Partial<FlightLog>, ownerId: string) {
  return {
    flightLog: {
      filename: flightLog.filename!,
      flight_date: flightLog.flightDate || null,
      drone_model: flightLog.droneModel || null,
      duration_seconds: flightLog.durationSeconds || null,
      max_altitude_m: flightLog.maxAltitudeM || null,
      max_distance_m: flightLog.maxDistanceM || null,
      home_lat: flightLog.homeLocation?.lat || null,
      home_lng: flightLog.homeLocation?.lng || null,
      start_lat: flightLog.startLocation?.lat || null,
      start_lng: flightLog.startLocation?.lng || null,
      end_lat: flightLog.endLocation?.lat || null,
      end_lng: flightLog.endLocation?.lng || null,
      total_distance_m: flightLog.totalDistanceM || null,
      max_speed_mps: flightLog.maxSpeedMps || null,
      battery_start_percent: flightLog.batteryStartPercent || null,
      battery_end_percent: flightLog.batteryEndPercent || null,
      metadata: flightLog.metadata || null,
    },
    dataPoints: (flightLog.dataPoints || []).map(dp => ({
      timestamp_offset_ms: dp.timestampOffsetMs,
      lat: dp.lat || null,
      lng: dp.lng || null,
      altitude_m: dp.altitudeM || null,
      speed_mps: dp.speedMps || null,
      heading_deg: dp.headingDeg || null,
      gimbal_pitch_deg: dp.gimbalPitchDeg || null,
      battery_percent: dp.batteryPercent || null,
      battery_voltage: dp.batteryVoltage || null,
      battery_current: dp.batteryCurrent || null,
      battery_temperature: dp.batteryTemperature || null,
      battery_min_temperature: dp.batteryMinTemperature || null,
      battery_max_temperature: dp.batteryMaxTemperature || null,
      battery_cell_voltages: dp.batteryCellVoltages || null,
      battery_cell_voltage_deviation: dp.batteryCellVoltageDeviation || null,
      battery_current_capacity: dp.batteryCurrentCapacity || null,
      battery_full_capacity: dp.batteryFullCapacity || null,
      signal_strength: dp.signalStrength || null,
      satellite_count: dp.satelliteCount || null,
      is_photo: dp.isPhoto || false,
      photo_filename: dp.photoFilename || null,
      thumbnail_url: dp.thumbnailUrl || null,
      original_file_url: dp.originalFileUrl || null,
      is_video_recording: dp.isVideoRecording || false,
      raw_data: dp.rawData || null,
    })),
  };
}

// Check if a flight log with the given filename already exists for the current user
export async function checkFlightLogExists(filename: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('flight_logs')
    .select('id')
    .eq('owner_id', user.id)
    .eq('filename', filename)
    .limit(1);

  if (error) {
    // 406 errors or "not found" errors can be safely treated as "doesn't exist"
    // This prevents spurious errors in the console when checking for duplicates
    if (error.code === 'PGRST116' || error.message?.includes('406') || error.message?.includes('Not Acceptable')) {
      return false;
    }
    // For other errors, still throw them as they might be real issues
    console.warn('Error checking for duplicate flight log:', error);
    return false; // Default to allowing upload on error to avoid blocking
  }

  return (data && data.length > 0) || false;
}

// Fetch all flight logs for current user
export async function fetchFlightLogs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: flightLogs, error } = await supabase
    .from('flight_logs')
    .select('*')
    .eq('owner_id', user.id)
    .order('flight_date', { ascending: false, nullsLast: true });

  if (error) throw error;

  // Fetch warnings/errors for all logs
  const logIds = flightLogs.map(log => log.id);
  let warningsErrors: FlightLogWarningErrorDB[] = [];
  
  if (logIds.length > 0) {
    const { data: weData, error: weError } = await supabase
      .from('flight_log_warnings_errors')
      .select('*')
      .in('flight_log_id', logIds);
    
    if (!weError && weData) {
      warningsErrors = weData as FlightLogWarningErrorDB[];
    }
  }
  
  // Group warnings/errors by flight_log_id
  const weByLogId = new Map<string, FlightLogWarningErrorDB[]>();
  warningsErrors.forEach(we => {
    if (!weByLogId.has(we.flight_log_id)) {
      weByLogId.set(we.flight_log_id, []);
    }
    weByLogId.get(we.flight_log_id)!.push(we);
  });

  // Fetch photo counts for all logs using database aggregation (very fast!)
  const photoCounts = new Map<string, number>();
  if (logIds.length > 0) {
    try {
      // Use the database function to get aggregated counts in a single query
      const { data, error: rpcError } = await supabase.rpc('get_photo_counts', {
        log_ids: logIds
      });
      
      if (!rpcError && data) {
        data.forEach((row: { flight_log_id: string; photo_count: number }) => {
          photoCounts.set(row.flight_log_id, row.photo_count);
        });
      } else if (rpcError) {
        console.warn('RPC function not available, falling back to manual aggregation:', rpcError);
        // Fallback: if RPC function doesn't exist yet, use the query approach
        const { data: photoDataPoints, error: photoError } = await supabase
          .from('flight_log_data_points')
          .select('flight_log_id')
          .in('flight_log_id', logIds)
          .eq('is_photo', true);
        
        if (!photoError && photoDataPoints) {
          photoDataPoints.forEach((dp) => {
            const logId = dp.flight_log_id;
            photoCounts.set(logId, (photoCounts.get(logId) || 0) + 1);
          });
        }
      }
    } catch (error) {
      console.error('Error fetching photo counts:', error);
      // Fallback on error
      const { data: photoDataPoints, error: photoError } = await supabase
        .from('flight_log_data_points')
        .select('flight_log_id')
        .in('flight_log_id', logIds)
        .eq('is_photo', true);
      
      if (!photoError && photoDataPoints) {
        photoDataPoints.forEach((dp) => {
          const logId = dp.flight_log_id;
          photoCounts.set(logId, (photoCounts.get(logId) || 0) + 1);
        });
      }
    }
  }

  return flightLogs.map(log => {
    const logWarningsErrors = weByLogId.get(log.id) || [];
    const photoCount = photoCounts.get(log.id) || 0;
    const flightLog = flightLogFromDB(log as FlightLogDB, [], logWarningsErrors);
    return {
      ...flightLog,
      photoCount,
    };
  });
}

export async function fetchBatteryStats(): Promise<BatteryStats[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Read from cached battery_stats table (fast!)
  console.log('[Battery Stats] Attempting to read from cache...');
  const { data: cachedStats, error: cacheError } = await supabase
    .from('battery_stats')
    .select('*')
    .eq('owner_id', user.id);

  if (cacheError) {
    // If table doesn't exist yet, fall back to recalculating (for backward compatibility)
    console.warn('[Battery Stats] Cache table error, falling back to recalculation:', cacheError.message);
    console.warn('[Battery Stats] Error code:', cacheError.code, 'Details:', cacheError.details);
    // Fall through to old calculation logic below
  } else if (cachedStats && cachedStats.length > 0) {
    // Cache exists and has data - read from it and merge with labels
    console.log(`[Battery Stats] ✓ Loading from cache (${cachedStats.length} batteries)`);
    const { data: labels, error: labelsError } = await supabase
      .from('battery_labels')
      .select('*')
      .eq('owner_id', user.id);

    if (labelsError) throw labelsError;

    const labelMap = new Map<string, string>();
    (labels || []).forEach((label: BatteryLabelDB) => {
      labelMap.set(label.battery_serial_number, label.label);
    });

    return cachedStats.map<BatteryStats>((stat: any) => ({
      serialNumber: stat.battery_serial_number,
      label: labelMap.get(stat.battery_serial_number),
      flightCount: stat.flight_count,
      totalFlightTimeSeconds: stat.total_flight_time_seconds,
      averageFlightTimeSeconds: stat.flight_count > 0 ? stat.total_flight_time_seconds / stat.flight_count : 0,
      totalDistanceM: stat.total_distance_m,
      averageBatteryUsagePercent: stat.battery_usage_samples > 0
        ? stat.total_battery_usage_percent / stat.battery_usage_samples
        : undefined,
      averageBatteryStartPercent: stat.battery_start_samples > 0
        ? stat.total_battery_start_percent / stat.battery_start_samples
        : undefined,
      averageBatteryEndPercent: stat.battery_end_samples > 0
        ? stat.total_battery_end_percent / stat.battery_end_samples
        : undefined,
      totalBatteryUsagePercent: stat.total_battery_usage_percent || undefined,
      firstFlightDate: stat.first_flight_date || undefined,
      lastFlightDate: stat.last_flight_date || undefined,
      averageVoltage: stat.avg_voltage || undefined,
      minVoltage: stat.min_voltage || undefined,
      maxVoltage: stat.max_voltage || undefined,
      averageTemperature: stat.avg_temperature || undefined,
      minTemperature: stat.min_temperature || undefined,
      maxTemperature: stat.max_temperature || undefined,
      averageCellDeviation: stat.avg_cell_deviation || undefined,
      maxCellDeviation: stat.max_cell_deviation || undefined,
      fullCapacity: stat.full_capacity || undefined,
    })).sort((a, b) => {
      const aName = a.label || a.serialNumber;
      const bName = b.label || b.serialNumber;
      return aName.localeCompare(bName);
    });
  }

  // Fallback: Recalculate if cache doesn't exist or is empty
  if (cachedStats && cachedStats.length === 0) {
    console.log('[Battery Stats] ⚠️ Cache is empty (0 batteries). Returning empty array. Use "Recalculate Stats" button to populate cache.');
    return [];
  }
  
  console.log('[Battery Stats] ⚠️ Cache not available, recalculating (this is slow)...');
  const { data, error } = await supabase
    .from('flight_logs')
    .select('id, flight_date, duration_seconds, total_distance_m, metadata, battery_start_percent, battery_end_percent')
    .eq('owner_id', user.id)
    .order('flight_date', { ascending: true });

  if (error) throw error;

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
    // Battery health aggregates
    voltageSamples: number[];
    temperatureSamples: number[];
    cellDeviationSamples: number[];
    fullCapacity?: number;
  }>();

  (data || []).forEach((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const serial = metadata?.batterySerialNumber as string | undefined;
    if (!serial) {
      return;
    }

    // Handle duration - could be null, undefined, or a number
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
    
    // Only add duration if it's a valid positive number
    if (duration > 0) {
      entry.totalFlightTimeSeconds += duration;
    }
    // Only add distance if it's a valid positive number
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

  // Fetch battery health data from sample data points for each battery
  const logIdsBySerial = new Map<string, string[]>(); // serial -> log IDs
  (data || []).forEach((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const serial = metadata?.batterySerialNumber as string | undefined;
    if (serial && log.id) {
      if (!logIdsBySerial.has(serial)) {
        logIdsBySerial.set(serial, []);
      }
      logIdsBySerial.get(serial)!.push(log.id);
    }
  });

  // Fetch sample battery health data points (first, middle, last of each flight for efficiency)
  for (const [serial, logIds] of logIdsBySerial.entries()) {
    if (!statsMap.has(serial)) continue;
    
    const entry = statsMap.get(serial)!;
    
    // For each flight log, get a sample of data points with battery data
    for (const logId of logIds) {
      // Get a sample of data points (first 10, middle 10, last 10) for battery health metrics
      const { data: sampleDataPoints, error: dpError } = await supabase
        .from('flight_log_data_points')
        .select('battery_voltage, battery_temperature, battery_cell_voltage_deviation, battery_full_capacity')
        .eq('flight_log_id', logId)
        .not('battery_voltage', 'is', null)
        .limit(30); // Sample size
      
      if (!dpError && sampleDataPoints) {
        sampleDataPoints.forEach((dp: any) => {
          if (dp.battery_voltage !== null && typeof dp.battery_voltage === 'number') {
            entry.voltageSamples!.push(dp.battery_voltage);
          }
          if (dp.battery_temperature !== null && typeof dp.battery_temperature === 'number') {
            entry.temperatureSamples!.push(dp.battery_temperature);
          }
          if (dp.battery_cell_voltage_deviation !== null && typeof dp.battery_cell_voltage_deviation === 'number') {
            entry.cellDeviationSamples!.push(dp.battery_cell_voltage_deviation);
          }
          if (dp.battery_full_capacity !== null && typeof dp.battery_full_capacity === 'number' && !entry.fullCapacity) {
            entry.fullCapacity = dp.battery_full_capacity; // Should be constant per battery
          }
        });
      }
    }
  }

  // Fetch battery labels
  const { data: labels, error: labelsError } = await supabase
    .from('battery_labels')
    .select('*')
    .eq('owner_id', user.id);

  if (labelsError) throw labelsError;

  const labelMap = new Map<string, string>();
  (labels || []).forEach((label: BatteryLabelDB) => {
    labelMap.set(label.battery_serial_number, label.label);
  });

  // Log summary for debugging (only in development, and only once)
  if (process.env.NODE_ENV === 'development') {
    const summary = Array.from(statsMap.values()).map(e => ({
      serial: e.serialNumber,
      flights: e.flightCount,
      totalTime: e.totalFlightTimeSeconds,
      avgTime: e.flightCount > 0 ? e.totalFlightTimeSeconds / e.flightCount : 0,
    }));
    // Only log if we have data
    if (summary.length > 0) {
      console.log('Battery stats summary:', summary);
    }
  }

  return Array.from(statsMap.values()).map<BatteryStats>((entry) => ({
    serialNumber: entry.serialNumber,
    label: labelMap.get(entry.serialNumber),
    flightCount: entry.flightCount,
    totalFlightTimeSeconds: entry.totalFlightTimeSeconds,
    averageFlightTimeSeconds: entry.flightCount > 0 ? entry.totalFlightTimeSeconds / entry.flightCount : 0,
    totalDistanceM: entry.totalDistanceM,
    averageBatteryUsagePercent: entry.batteryUsageSamples > 0
      ? entry.totalBatteryUsagePercent / entry.batteryUsageSamples
      : undefined,
    averageBatteryStartPercent: entry.batteryStartSamples > 0
      ? entry.totalBatteryStartPercent / entry.batteryStartSamples
      : undefined,
    averageBatteryEndPercent: entry.batteryEndSamples > 0
      ? entry.totalBatteryEndPercent / entry.batteryEndSamples
      : undefined,
    totalBatteryUsagePercent: entry.totalBatteryUsagePercent,
    firstFlightDate: entry.firstFlightDate,
    lastFlightDate: entry.lastFlightDate,
    // Calculate battery health aggregates
    averageVoltage: entry.voltageSamples && entry.voltageSamples.length > 0
      ? entry.voltageSamples.reduce((a, b) => a + b, 0) / entry.voltageSamples.length
      : undefined,
    minVoltage: entry.voltageSamples && entry.voltageSamples.length > 0
      ? Math.min(...entry.voltageSamples)
      : undefined,
    maxVoltage: entry.voltageSamples && entry.voltageSamples.length > 0
      ? Math.max(...entry.voltageSamples)
      : undefined,
    averageTemperature: entry.temperatureSamples && entry.temperatureSamples.length > 0
      ? entry.temperatureSamples.reduce((a, b) => a + b, 0) / entry.temperatureSamples.length
      : undefined,
    minTemperature: entry.temperatureSamples && entry.temperatureSamples.length > 0
      ? Math.min(...entry.temperatureSamples)
      : undefined,
    maxTemperature: entry.temperatureSamples && entry.temperatureSamples.length > 0
      ? Math.max(...entry.temperatureSamples)
      : undefined,
    averageCellDeviation: entry.cellDeviationSamples && entry.cellDeviationSamples.length > 0
      ? entry.cellDeviationSamples.reduce((a, b) => a + b, 0) / entry.cellDeviationSamples.length
      : undefined,
    maxCellDeviation: entry.cellDeviationSamples && entry.cellDeviationSamples.length > 0
      ? Math.max(...entry.cellDeviationSamples)
      : undefined,
    fullCapacity: entry.fullCapacity,
  })).sort((a, b) => {
    // Sort by label if available, otherwise by serial number
    const aName = a.label || a.serialNumber;
    const bName = b.label || b.serialNumber;
    return aName.localeCompare(bName);
  });
}

// Battery Label Functions

// Save or update battery label
export async function saveBatteryLabel(batterySerialNumber: string, label: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('battery_labels')
    .upsert({
      owner_id: user.id,
      battery_serial_number: batterySerialNumber,
      label: label.trim(),
    }, {
      onConflict: 'owner_id,battery_serial_number',
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    batterySerialNumber: data.battery_serial_number,
    label: data.label,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as BatteryLabel;
}

// Delete battery label
export async function deleteBatteryLabel(batterySerialNumber: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('battery_labels')
    .delete()
    .eq('owner_id', user.id)
    .eq('battery_serial_number', batterySerialNumber);

  if (error) throw error;
}

// Get previous and next flight log IDs based on date order
export async function getAdjacentFlightLogIds(currentLogId: string): Promise<{ previousId: string | null; nextId: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current log's date
  const { data: currentLog, error: currentError } = await supabase
    .from('flight_logs')
    .select('id, flight_date')
    .eq('id', currentLogId)
    .eq('owner_id', user.id)
    .single();

  if (currentError || !currentLog) {
    return { previousId: null, nextId: null };
  }

  const currentDate = currentLog.flight_date;

  // Get all logs ordered by date (descending - newest first)
  const { data: allLogs, error: allError } = await supabase
    .from('flight_logs')
    .select('id, flight_date')
    .eq('owner_id', user.id)
    .order('flight_date', { ascending: false, nullsLast: true });

  if (allError || !allLogs) {
    return { previousId: null, nextId: null };
  }

  // Sort logs by date (newest first), then find current log's position
  const sortedLogs = allLogs.sort((a, b) => {
    const dateA = a.flight_date ? new Date(a.flight_date).getTime() : 0;
    const dateB = b.flight_date ? new Date(b.flight_date).getTime() : 0;
    if (dateA !== dateB) {
      return dateB - dateA; // Newest first
    }
    // If dates are equal, sort by ID for consistency
    return a.id.localeCompare(b.id);
  });

  const currentIndex = sortedLogs.findIndex(log => log.id === currentLogId);
  
  if (currentIndex === -1) {
    return { previousId: null, nextId: null };
  }

  // Previous = older date (later in sorted array, since it's sorted newest first)
  // Next = newer date (earlier in sorted array)
  const previousId = currentIndex < sortedLogs.length - 1 ? sortedLogs[currentIndex + 1].id : null;
  const nextId = currentIndex > 0 ? sortedLogs[currentIndex - 1].id : null;

  return { previousId, nextId };
}

// Fetch single flight log with data points
export async function fetchFlightLog(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: flightLog, error } = await supabase
    .from('flight_logs')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (error) throw error;

  // Fetch all data points but exclude raw_data (large JSONB field) to reduce payload size
  // We need all points for battery health analysis, but raw_data is only used for debugging
  let allDataPoints: FlightLogDataPointDB[] = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: dataPoints, error: dpError } = await supabase
      .from('flight_log_data_points')
      .select('id, timestamp_offset_ms, lat, lng, altitude_m, speed_mps, heading_deg, gimbal_pitch_deg, battery_percent, battery_voltage, battery_current, battery_temperature, battery_min_temperature, battery_max_temperature, battery_cell_voltages, battery_cell_voltage_deviation, battery_current_capacity, battery_full_capacity, signal_strength, satellite_count, is_photo, photo_filename, thumbnail_url, original_file_url, is_video_recording')
      .eq('flight_log_id', id)
      .order('timestamp_offset_ms', { ascending: true })
      .range(offset, offset + limit - 1);

    if (dpError) throw dpError;

    if (dataPoints && dataPoints.length > 0) {
      // Map to full structure with null for raw_data (excluded from query)
      const mappedPoints = dataPoints.map(dp => ({
        ...dp,
        raw_data: null, // Excluded to reduce payload size (only needed for debugging)
      })) as FlightLogDataPointDB[];
      
      allDataPoints = [...allDataPoints, ...mappedPoints];
      offset += limit;
      hasMore = dataPoints.length === limit;
    } else {
      hasMore = false;
    }
  }

  // Log summary once at the end
  if (allDataPoints.length > 0) {
    console.log(`Fetched ${allDataPoints.length} data points (excluded raw_data field to reduce payload size)`);
  }

  // Fetch warnings and errors for this log
  const { data: warningsErrors, error: weError } = await supabase
    .from('flight_log_warnings_errors')
    .select('*')
    .eq('flight_log_id', id)
    .order('timestamp_offset_ms', { ascending: true, nullsLast: true });

  if (weError) {
    console.error('Error fetching warnings/errors:', weError);
    // Don't fail if warnings/errors can't be fetched
  }

  return flightLogFromDB(
    flightLog as FlightLogDB, 
    allDataPoints,
    (warningsErrors || []) as FlightLogWarningErrorDB[]
  );
}

// Save flight log (create only)
export async function saveFlightLog(flightLog: Partial<FlightLog>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { flightLog: flightLogData, dataPoints: dataPointsData } = flightLogToDB(flightLog, user.id);

  // Create flight log
  const { data: newFlightLog, error: flightLogError } = await supabase
    .from('flight_logs')
    .insert({ ...flightLogData, owner_id: user.id })
    .select()
    .single();

  if (flightLogError) throw flightLogError;

  // Insert data points in batches to avoid hitting limits
  const batchSize = 1000;
  for (let i = 0; i < dataPointsData.length; i += batchSize) {
    const batch = dataPointsData.slice(i, i + batchSize);
    const { error: dpError } = await supabase
      .from('flight_log_data_points')
      .insert(
        batch.map(dp => ({ ...dp, flight_log_id: newFlightLog.id }))
      );

    if (dpError) throw dpError;
  }

  return newFlightLog.id;
}

// Delete flight log
export async function deleteFlightLog(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('flight_logs')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw error;
}

// Fleet Drone Functions

// Convert DB format to frontend format
export function droneFromDB(drone: DroneDB): Drone {
  return {
    id: drone.id,
    serialNumber: drone.serial_number,
    model: drone.model || undefined,
    name: drone.name || undefined,
    firstSeen: drone.first_seen,
    lastSeen: drone.last_seen,
    createdAt: drone.created_at,
    updatedAt: drone.updated_at,
  };
}

// Fetch all drones in fleet with statistics
export async function fetchFleetDrones(): Promise<Drone[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch all drones
  const { data: drones, error: dronesError } = await supabase
    .from('fleet_drones')
    .select('*')
    .eq('owner_id', user.id)
    .order('first_seen', { ascending: false });

  if (dronesError) throw dronesError;

  // Fetch flight logs for statistics
  const { data: flightLogs, error: logsError } = await supabase
    .from('flight_logs')
    .select('id, flight_date, duration_seconds, total_distance_m, metadata')
    .eq('owner_id', user.id);

  if (logsError) throw logsError;

  // Calculate statistics for each drone
  return (drones || []).map((drone: DroneDB) => {
    const droneLogs = (flightLogs || []).filter((log: any) => {
      const metadata = log.metadata as Record<string, unknown> | null;
      return metadata?.droneSerialNumber === drone.serial_number;
    });

    const flightCount = droneLogs.length;
    const totalFlightTimeSeconds = droneLogs.reduce((sum: number, log: any) => {
      return sum + (log.duration_seconds || 0);
    }, 0);
    const totalFlightDistanceM = droneLogs.reduce((sum: number, log: any) => {
      return sum + (log.total_distance_m || 0);
    }, 0);

    return {
      ...droneFromDB(drone),
      flightCount,
      totalFlightTimeSeconds,
      totalFlightDistanceM,
    };
  });
}

// Update drone name
export async function updateDroneName(serialNumber: string, name: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('fleet_drones')
    .update({ name: name.trim() || null })
    .eq('owner_id', user.id)
    .eq('serial_number', serialNumber);

  if (error) throw error;
}

// Delete drone from fleet
export async function deleteDrone(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('fleet_drones')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw error;
}

// Orthomosaic Project Functions

// Convert DB format to frontend format
export function orthomosaicProjectFromDB(project: OrthomosaicProjectDB): OrthomosaicProject {
  return {
    id: project.id,
    missionId: project.mission_id || undefined,
    flightLogId: project.flight_log_id || undefined,
    name: project.name,
    description: project.description || undefined,
    status: project.status,
    area: project.area_north && project.area_south && project.area_east && project.area_west
      ? {
          north: project.area_north,
          south: project.area_south,
          east: project.area_east,
          west: project.area_west,
        }
      : undefined,
    photoCount: project.photo_count || undefined,
    processingStartedAt: project.processing_started_at || undefined,
    processingCompletedAt: project.processing_completed_at || undefined,
    processingError: project.processing_error || undefined,
    orthomosaicUrl: project.orthomosaic_url || undefined,
    orthomosaicTilesUrl: project.orthomosaic_tiles_url || undefined,
    demUrl: project.dem_url || undefined,
    pointCloudUrl: project.point_cloud_url || undefined,
    metadata: project.metadata || undefined,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

// Fetch all orthomosaic projects for current user
export async function fetchOrthomosaicProjects(): Promise<OrthomosaicProject[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: projects, error } = await supabase
    .from('orthomosaic_projects')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (projects || []).map(p => orthomosaicProjectFromDB(p as OrthomosaicProjectDB));
}

// Fetch single orthomosaic project
export async function fetchOrthomosaicProject(id: string): Promise<OrthomosaicProject> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: project, error } = await supabase
    .from('orthomosaic_projects')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (error) throw error;
  return orthomosaicProjectFromDB(project as OrthomosaicProjectDB);
}

// Create orthomosaic project
export async function createOrthomosaicProject(
  project: Omit<OrthomosaicProject, 'id' | 'createdAt' | 'updatedAt'>
): Promise<OrthomosaicProject> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('orthomosaic_projects')
    .insert({
      owner_id: user.id,
      mission_id: project.missionId || null,
      flight_log_id: project.flightLogId || null,
      name: project.name,
      description: project.description || null,
      status: project.status,
      area_north: project.area?.north || null,
      area_south: project.area?.south || null,
      area_east: project.area?.east || null,
      area_west: project.area?.west || null,
      photo_count: project.photoCount || null,
      metadata: project.metadata || null,
    })
    .select()
    .single();

  if (error) throw error;
  return orthomosaicProjectFromDB(data as OrthomosaicProjectDB);
}

// Update orthomosaic project
export async function updateOrthomosaicProject(
  id: string,
  updates: Partial<OrthomosaicProject>
): Promise<OrthomosaicProject> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.area !== undefined) {
    updateData.area_north = updates.area.north;
    updateData.area_south = updates.area.south;
    updateData.area_east = updates.area.east;
    updateData.area_west = updates.area.west;
  }
  if (updates.photoCount !== undefined) updateData.photo_count = updates.photoCount;
  if (updates.processingStartedAt !== undefined) updateData.processing_started_at = updates.processingStartedAt;
  if (updates.processingCompletedAt !== undefined) updateData.processing_completed_at = updates.processingCompletedAt;
  if (updates.processingError !== undefined) updateData.processing_error = updates.processingError;
  if (updates.orthomosaicUrl !== undefined) updateData.orthomosaic_url = updates.orthomosaicUrl;
  if (updates.orthomosaicTilesUrl !== undefined) updateData.orthomosaic_tiles_url = updates.orthomosaicTilesUrl;
  if (updates.demUrl !== undefined) updateData.dem_url = updates.demUrl;
  if (updates.pointCloudUrl !== undefined) updateData.point_cloud_url = updates.pointCloudUrl;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { data, error } = await supabase
    .from('orthomosaic_projects')
    .update(updateData)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return orthomosaicProjectFromDB(data as OrthomosaicProjectDB);
}

// Delete orthomosaic project
export async function deleteOrthomosaicProject(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('orthomosaic_projects')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw error;
}



