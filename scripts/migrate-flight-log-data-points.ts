#!/usr/bin/env tsx
/**
 * Migrate ALL flight_log_data_points from cloud to local Supabase
 * This handles pagination to get all data points, not just the first 1000
 */

import { createClient } from '@supabase/supabase-js';

// Cloud Supabase (source)
const CLOUD_URL = 'https://uiknuzhkrljfbvxjhsxr.supabase.co';
const CLOUD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpa251emhrcmxqZmJ2eGpoc3hyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzk3MjM3NSwiZXhwIjoyMDc5NTQ4Mzc1fQ.A8EGJfFqeIY17dLd0upCcV0V_NURUpsdZ2U-_GfQ3YQ';

// Local Supabase (destination)
const LOCAL_URL = process.env.LOCAL_SUPABASE_URL || 'http://localhost:54321';
const LOCAL_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || '';

if (!LOCAL_SERVICE_KEY) {
  console.error('❌ Error: LOCAL_SUPABASE_SERVICE_KEY must be set');
  console.error('\nSet it as:');
  console.error('  export LOCAL_SUPABASE_URL="http://localhost:54321"');
  console.error('  export LOCAL_SUPABASE_SERVICE_KEY="sb_secret_..."');
  process.exit(1);
}

const cloudClient = createClient(CLOUD_URL, CLOUD_SERVICE_KEY, {
  db: { schema: 'public' },
});

const localClient = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  db: { schema: 'drone' },
});

async function migrateAllDataPoints() {
  console.log('🚀 Migrating ALL flight_log_data_points from cloud to local');
  console.log('==========================================================');
  console.log(`Cloud: ${CLOUD_URL} (public schema)`);
  console.log(`Local: ${LOCAL_URL} (drone schema)\n`);

  // First, get total count from cloud
  const { count: totalCount, error: countError } = await cloudClient
    .from('flight_log_data_points')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error getting count:', countError);
    process.exit(1);
  }

  console.log(`📊 Total data points in cloud: ${totalCount}\n`);

  // Migrate in batches with pagination
  const batchSize = 1000;
  let offset = 0;
  let totalMigrated = 0;
  let totalInserted = 0;

  while (offset < (totalCount || 0)) {
    console.log(`📥 Fetching batch ${Math.floor(offset / batchSize) + 1} (offset ${offset}...)`);
    
    const { data, error: fetchError } = await cloudClient
      .from('flight_log_data_points')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (fetchError) {
      console.error(`❌ Error fetching batch:`, fetchError);
      break;
    }

    if (!data || data.length === 0) {
      console.log('  ⚠️  No more data to fetch');
      break;
    }

    console.log(`  📦 Fetched ${data.length} data points`);

    // Insert in smaller batches to avoid timeouts
    const insertBatchSize = 500;
    for (let i = 0; i < data.length; i += insertBatchSize) {
      const insertBatch = data.slice(i, i + insertBatchSize);
      
      const { error: insertError } = await localClient
        .from('flight_log_data_points')
        .upsert(insertBatch, { onConflict: 'id' });

      if (insertError) {
        console.error(`  ❌ Error inserting batch ${Math.floor(i / insertBatchSize) + 1}:`, insertError);
        // Continue with next batch
        continue;
      }

      totalInserted += insertBatch.length;
      console.log(`  ✅ Inserted ${insertBatch.length} data points (${totalInserted} total)`);
    }

    totalMigrated += data.length;
    offset += batchSize;

    // If we got fewer than batchSize, we're done
    if (data.length < batchSize) {
      break;
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Fetched: ${totalMigrated} data points`);
  console.log(`   Inserted: ${totalInserted} data points`);

  // Verify by counting photos
  const { count: photoCount, error: photoCountError } = await localClient
    .from('flight_log_data_points')
    .select('*', { count: 'exact', head: true })
    .eq('is_photo', true);

  if (!photoCountError && photoCount !== null) {
    console.log(`\n📸 Photo data points: ${photoCount}`);
  }
}

migrateAllDataPoints().catch(console.error);
