export type MissionType = 'waypoint' | 'mapping';

export type Mission = {
  id: string;
  name: string;
  description?: string;
  droneModel: string;
  missionType?: MissionType; // Defaults to 'waypoint'
  homeLocation?: {
    lat: number;
    lng: number;
  };
  defaultAltitudeM: number;
  defaultSpeedMps: number;
  waypoints: Waypoint[];
  // Mapping-specific fields (only used when missionType === 'mapping')
  mappingArea?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  overlap?: {
    front: number; // Front overlap percentage (60-90)
    side: number;  // Side overlap percentage (60-90)
  };
  gridSettings?: {
    pattern: 'parallel_lines' | 'zigzag';
    direction: 'north_south' | 'east_west';
  };
  processingSettings?: {
    gsdTarget?: number; // Target Ground Sample Distance in cm
    orthophotoResolution?: number; // Resolution in cm/pixel for output
  };
  createdAt?: string;
  updatedAt?: string;
};

export type Waypoint = {
  id: string;
  index: number;
  lat: number;
  lng: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  gimbalPitchDeg?: number;
  actionType?: string;
  actionPayload?: Record<string, unknown>;
};

export type MissionDB = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  drone_model: string;
  mission_type: MissionType | null;
  home_lat: number | null;
  home_lng: number | null;
  default_altitude_m: number;
  default_speed_mps: number;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

export type WaypointDB = {
  id: string;
  mission_id: string;
  index: number;
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  gimbal_pitch_deg: number | null;
  action_type: string | null;
  action_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

// Flight Log Types
export type FlightLogDataPoint = {
  id?: string;
  timestampOffsetMs: number;
  lat?: number;
  lng?: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  gimbalPitchDeg?: number;
  batteryPercent?: number;
  batteryVoltage?: number;
  batteryCurrent?: number;
  batteryTemperature?: number;
  batteryMinTemperature?: number;
  batteryMaxTemperature?: number;
  batteryCellVoltages?: number[];
  batteryCellVoltageDeviation?: number;
  batteryCurrentCapacity?: number;
  batteryFullCapacity?: number;
  signalStrength?: number;
  satelliteCount?: number;
  isPhoto?: boolean;
  photoFilename?: string;
  thumbnailUrl?: string;
  originalFileUrl?: string;
  isVideoRecording?: boolean;
  rawData?: Record<string, unknown>;
};

export type FlightLogWarningError = {
  id?: string;
  severity: 'warning' | 'error';
  category: string;
  message: string;
  timestampOffsetMs?: number;
  details?: Record<string, unknown>;
};

export type FlightLog = {
  id: string;
  filename: string;
  flightDate?: string;
  droneModel?: string;
  durationSeconds?: number;
  maxAltitudeM?: number;
  maxDistanceM?: number;
  homeLocation?: {
    lat: number;
    lng: number;
  };
  startLocation?: {
    lat: number;
    lng: number;
  };
  endLocation?: {
    lat: number;
    lng: number;
  };
  totalDistanceM?: number;
  maxSpeedMps?: number;
  batteryStartPercent?: number;
  batteryEndPercent?: number;
  metadata?: Record<string, unknown>;
  warnings?: FlightLogWarningError[];
  errors?: FlightLogWarningError[];
  createdAt?: string;
  updatedAt?: string;
  dataPoints?: FlightLogDataPoint[];
  photoCount?: number;
};

export type BatteryStats = {
  serialNumber: string;
  label?: string; // User-defined readable label
  flightCount: number;
  totalFlightTimeSeconds: number;
  averageFlightTimeSeconds: number;
  totalDistanceM: number;
  averageBatteryUsagePercent?: number;
  totalBatteryUsagePercent?: number;
  averageBatteryStartPercent?: number;
  averageBatteryEndPercent?: number;
  firstFlightDate?: string;
  lastFlightDate?: string;
  // Battery health metrics
  averageVoltage?: number;
  minVoltage?: number;
  maxVoltage?: number;
  averageTemperature?: number;
  minTemperature?: number;
  maxTemperature?: number;
  averageCellDeviation?: number;
  maxCellDeviation?: number;
  fullCapacity?: number; // Should be constant per battery
};

export type BatteryLabel = {
  id: string;
  batterySerialNumber: string;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type BatteryLabelDB = {
  id: string;
  owner_id: string;
  battery_serial_number: string;
  label: string;
  created_at: string;
  updated_at: string;
};

export type FlightLogDB = {
  id: string;
  owner_id: string;
  filename: string;
  flight_date: string | null;
  drone_model: string | null;
  duration_seconds: number | null;
  max_altitude_m: number | null;
  max_distance_m: number | null;
  home_lat: number | null;
  home_lng: number | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  total_distance_m: number | null;
  max_speed_mps: number | null;
  battery_start_percent: number | null;
  battery_end_percent: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type FlightLogWarningErrorDB = {
  id: string;
  flight_log_id: string;
  severity: 'warning' | 'error';
  category: string;
  message: string;
  timestamp_offset_ms: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type FlightLogDataPointDB = {
  id: string;
  flight_log_id: string;
  timestamp_offset_ms: number;
  lat: number | null;
  lng: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  gimbal_pitch_deg: number | null;
  battery_percent: number | null;
  battery_voltage: number | null;
  battery_current: number | null;
  battery_temperature: number | null;
  battery_min_temperature: number | null;
  battery_max_temperature: number | null;
  battery_cell_voltages: number[] | null;
  battery_cell_voltage_deviation: number | null;
  battery_current_capacity: number | null;
  battery_full_capacity: number | null;
  signal_strength: number | null;
  satellite_count: number | null;
  is_photo: boolean;
  photo_filename: string | null;
  thumbnail_url: string | null;
  original_file_url: string | null;
  is_video_recording: boolean;
  raw_data: Record<string, unknown> | null;
  created_at: string;
};

// Fleet Drone Types
export type Drone = {
  id: string;
  serialNumber: string;
  model?: string;
  name?: string;
  firstSeen?: string;
  lastSeen?: string;
  flightCount?: number;
  totalFlightTimeSeconds?: number;
  totalFlightDistanceM?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DroneDB = {
  id: string;
  owner_id: string;
  serial_number: string;
  model: string | null;
  name: string | null;
  first_seen: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
};

// Orthomosaic Types
export type OrthomosaicProject = {
  id: string;
  missionId?: string;
  flightLogId?: string;
  name: string;
  description?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  area?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  photoCount?: number;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  processingError?: string;
  orthomosaicUrl?: string;
  orthomosaicTilesUrl?: string;
  demUrl?: string;
  pointCloudUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type OrthomosaicProjectDB = {
  id: string;
  owner_id: string;
  mission_id: string | null;
  flight_log_id: string | null;
  name: string;
  description: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  area_north: number | null;
  area_south: number | null;
  area_east: number | null;
  area_west: number | null;
  photo_count: number | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processing_error: string | null;
  orthomosaic_url: string | null;
  orthomosaic_tiles_url: string | null;
  dem_url: string | null;
  point_cloud_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};



