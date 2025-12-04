#!/usr/bin/env tsx
/**
 * Script to update photo filenames in the database to match the format:
 * DJI_YYYYMMDDHHMMSS_####_D.DNG
 * 
 * This script:
 * 1. Fetches all flight logs with photos
 * 2. For each photo, constructs a new filename based on flight_date + timestamp_offset_ms
 * 3. Updates the photo_filename field in the database
 * 
 * Usage:
 *   tsx scripts/update-photo-filenames.ts [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing required environment variables.');
  console.error('Required:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nThe service role key is required to update data for all users.');
  console.error('You can find it in your Supabase project settings under API.');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const isDryRun = process.argv.includes('--dry-run');

/**
 * Construct a photo filename in the format: DJI_YYYYMMDDHHMMSS_####_D.DNG
 */
function constructPhotoFilename(
  flightDate: Date,
  timestampOffsetMs: number,
  photoIndex: number
): string {
  // Calculate the exact photo time: flight_date + timestamp_offset_ms
  const photoTime = new Date(flightDate.getTime() + timestampOffsetMs);

  const year = photoTime.getFullYear();
  const month = String(photoTime.getMonth() + 1).padStart(2, '0');
  const day = String(photoTime.getDate()).padStart(2, '0');
  const hours = String(photoTime.getHours()).padStart(2, '0');
  const minutes = String(photoTime.getMinutes()).padStart(2, '0');
  const seconds = String(photoTime.getSeconds()).padStart(2, '0');
  const photoNum = String(photoIndex).padStart(4, '0');

  // Format: DJI_YYYYMMDDHHMMSS_####_D.DNG (no underscores in date/time)
  return `DJI_${year}${month}${day}${hours}${minutes}${seconds}_${photoNum}_D.DNG`;
}

/**
 * Update photo filenames for a single flight log
 */
async function updateFilenamesForFlightLog(flightLogId: string, flightDate: Date | null): Promise<number> {
  if (!flightDate) {
    console.warn(`  ⚠️  Skipping flight log ${flightLogId}: No flight_date`);
    return 0;
  }

  // Fetch all photo data points for this flight log, ordered by timestamp
  const { data: photoDataPoints, error: fetchError } = await supabase
    .from('flight_log_data_points')
    .select('id, timestamp_offset_ms, photo_filename')
    .eq('flight_log_id', flightLogId)
    .eq('is_photo', true)
    .order('timestamp_offset_ms', { ascending: true });

  if (fetchError) {
    console.error(`  ❌ Error fetching photo data points for ${flightLogId}:`, fetchError.message);
    return 0;
  }

  if (!photoDataPoints || photoDataPoints.length === 0) {
    console.log(`  ℹ️  No photos found for flight log ${flightLogId}`);
    return 0;
  }

  console.log(`  📸 Found ${photoDataPoints.length} photo(s) in flight log ${flightLogId}`);

  let updatedCount = 0;
  let skippedCount = 0;

  // Update each photo filename
  for (let i = 0; i < photoDataPoints.length; i++) {
    const photo = photoDataPoints[i];
    const photoIndex = i + 1; // Photo numbers start at 1
    const newFilename = constructPhotoFilename(flightDate, photo.timestamp_offset_ms, photoIndex);

    // Check if filename needs updating
    const currentFilename = photo.photo_filename || null;
    const needsUpdate = currentFilename !== newFilename;

    if (!needsUpdate) {
      skippedCount++;
      continue;
    }

    if (isDryRun) {
      console.log(`    [DRY RUN] Would update photo ${photoIndex}:`);
      console.log(`      Old: ${currentFilename || '(empty)'}`);
      console.log(`      New: ${newFilename}`);
    } else {
      // Update the filename
      const { error: updateError } = await supabase
        .from('flight_log_data_points')
        .update({ photo_filename: newFilename })
        .eq('id', photo.id);

      if (updateError) {
        console.error(`    ❌ Error updating photo ${photoIndex} (${photo.id}):`, updateError.message);
        continue;
      }

      console.log(`    ✓ Updated photo ${photoIndex}: ${newFilename}`);
    }

    updatedCount++;
  }

  if (skippedCount > 0) {
    console.log(`    ℹ️  Skipped ${skippedCount} photo(s) that already have correct filenames`);
  }

  return updatedCount;
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Starting photo filename update script...\n');

  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE: No changes will be made to the database\n');
  }

  // Fetch all flight logs that have photos
  const { data: flightLogs, error: logsError } = await supabase
    .from('flight_logs')
    .select('id, filename, flight_date')
    .not('flight_date', 'is', null)
    .order('flight_date', { ascending: false });

  if (logsError) {
    console.error('❌ Error fetching flight logs:', logsError.message);
    process.exit(1);
  }

  if (!flightLogs || flightLogs.length === 0) {
    console.log('ℹ️  No flight logs found with flight_date');
    return;
  }

  console.log(`📋 Found ${flightLogs.length} flight log(s) with flight_date\n`);

  let totalUpdated = 0;
  let totalFlightLogs = 0;

  // Process each flight log
  for (const flightLog of flightLogs) {
    console.log(`\n📝 Processing flight log: ${flightLog.filename}`);
    console.log(`   ID: ${flightLog.id}`);
    console.log(`   Date: ${flightLog.flight_date ? new Date(flightLog.flight_date).toISOString() : 'N/A'}`);

    const updated = await updateFilenamesForFlightLog(
      flightLog.id,
      flightLog.flight_date ? new Date(flightLog.flight_date) : null
    );

    if (updated > 0) {
      totalUpdated += updated;
      totalFlightLogs++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Flight logs processed: ${flightLogs.length}`);
  console.log(`   Flight logs with updates: ${totalFlightLogs}`);
  console.log(`   Total photos updated: ${totalUpdated}`);

  if (isDryRun) {
    console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Photo filename update completed!');
  }
}

// Run the script
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

