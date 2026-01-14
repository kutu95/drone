#!/usr/bin/env ts-node
/**
 * Migrate data from cloud Supabase to local Supabase using REST API
 * This works around PostgreSQL connection issues
 */

import { createClient } from '@supabase/supabase-js';

// Cloud Supabase (source)
const CLOUD_URL = 'https://uiknuzhkrljfbvxjhsxr.supabase.co';
const CLOUD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpa251emhrcmxqZmJ2eGpoc3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NzIzNzUsImV4cCI6MjA3OTU0ODM3NX0.Y3NcZOtKIEWx13J4IC5Y02BZmacbmE1N7ZeNmBlQhho';
const CLOUD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpa251emhrcmxqZmJ2eGpoc3hyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzk3MjM3NSwiZXhwIjoyMDc5NTQ4Mzc1fQ.A8EGJfFqeIY17dLd0upCcV0V_NURUpsdZ2U-_GfQ3YQ';

// Local Supabase (destination)
// Get from: supabase status (on your server)
const LOCAL_URL = process.env.LOCAL_SUPABASE_URL || 'http://localhost:54321';
// For local Supabase, you can use the anon key or service role key
// Service role key is in: ~/.supabase/config.toml or use anon key
const LOCAL_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || 
                          process.env.SUPABASE_SERVICE_ROLE_KEY || 
                          process.env.LOCAL_SUPABASE_ANON_KEY || 
                          '';

if (!LOCAL_SERVICE_KEY) {
  console.error('❌ Error: LOCAL_SUPABASE_SERVICE_KEY must be set');
  console.error('\nFor local Supabase, you can use the anon key from "supabase status"');
  console.error('Look for "Secret" key in the Authentication Keys section');
  console.error('\nSet it as:');
  console.error('  export LOCAL_SUPABASE_URL="http://192.168.0.146:54321"  # Your server IP');
  console.error('  export LOCAL_SUPABASE_SERVICE_KEY="sb_secret_..."  # The "Secret" key from supabase status');
  console.error('\nOr if running from server:');
  console.error('  export LOCAL_SUPABASE_URL="http://localhost:54321"');
  console.error('  export LOCAL_SUPABASE_SERVICE_KEY="sb_secret_..."');
  process.exit(1);
}

const cloudClient = createClient(CLOUD_URL, CLOUD_SERVICE_KEY, {
  db: { schema: 'public' }, // Cloud uses public schema
});

// Use public schema for migration (we'll move to drone schema after via SQL)
// This works around PostgREST schema exposure requirements
const localClient = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  db: { schema: 'public' }, // Temporarily use public, then move to drone
});

// Tables to migrate (in dependency order)
// Note: auth.users must be migrated separately via SQL
const TABLES = [
  'profiles',
  'missions',
  'mission_waypoints',
  'flight_logs',
  'flight_log_data_points',
  'flight_log_warnings_errors',
  'battery_labels',
  'fleet_drones',
  'battery_stats',
  'orthomosaic_projects',
];

async function migrateAuthUser(userId: string) {
  console.log(`\n👤 Migrating auth user: ${userId}...`);
  
  // Get user from cloud
  const { data: cloudUser, error: cloudError } = await cloudClient.auth.admin.getUserById(userId);
  
  if (cloudError || !cloudUser) {
    console.error(`❌ Error fetching user from cloud:`, cloudError);
    return false;
  }
  
  // Create user in local (this requires admin API)
  // Note: We'll need to use SQL for this as Supabase JS doesn't support creating users directly
  console.log(`  ⚠️  User migration requires SQL - will provide instructions`);
  return false;
}

async function migrateTable(tableName: string) {
  console.log(`\n📦 Migrating ${tableName}...`);
  
  // Fetch all data from cloud
  const { data, error } = await cloudClient
    .from(tableName)
    .select('*');
  
  if (error) {
    console.error(`❌ Error fetching ${tableName}:`, error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log(`  ⚠️  No data in ${tableName}`);
    return;
  }
  
  console.log(`  📥 Fetched ${data.length} rows from cloud`);
  
  // Insert into local (in batches to avoid limits)
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    const { error: insertError } = await localClient
      .from(tableName)
      .insert(batch);
    
    if (insertError) {
      console.error(`  ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError);
      // Continue with next batch
      continue;
    }
    
    inserted += batch.length;
    console.log(`  ✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${data.length} rows)`);
  }
  
  console.log(`  ✅ Completed ${tableName}: ${inserted}/${data.length} rows migrated`);
}

async function main() {
  console.log('🚀 Starting data migration via REST API');
  console.log('========================================');
  console.log(`Cloud: ${CLOUD_URL} (public schema)`);
  console.log(`Local: ${LOCAL_URL} (drone schema)`);
  console.log('');
  
  // Check local connection
  console.log('🔍 Testing local Supabase connection...');
  const { data: testData, error: testError } = await localClient
    .from('missions')
    .select('count')
    .limit(1);
  
  if (testError && testError.code !== 'PGRST116') {
    console.error('❌ Cannot connect to local Supabase:', testError);
    console.error('\nPlease ensure:');
    console.error('1. Local Supabase is running: supabase status');
    console.error('2. Set LOCAL_SUPABASE_URL (default: http://localhost:54321)');
    console.error('   For server: http://192.168.0.146:54321');
    console.error('3. Set LOCAL_SUPABASE_SERVICE_KEY (get from: supabase status)');
    console.error('\nExample:');
    console.error('  export LOCAL_SUPABASE_URL="http://192.168.0.146:54321"');
    console.error('  export LOCAL_SUPABASE_SERVICE_KEY="your-service-key"');
    console.error('  npm run migrate:data');
    process.exit(1);
  }
  
  console.log('✅ Local Supabase connection OK\n');
  
  // First, we need to migrate the auth user
  // Extract user ID from cloud data
  console.log('👤 Checking for auth users to migrate...');
  const { data: testMission } = await cloudClient
    .from('missions')
    .select('owner_id')
    .limit(1)
    .single();
  
  if (testMission?.owner_id) {
    console.log(`\n⚠️  IMPORTANT: You need to migrate auth user first!`);
    console.log(`   User ID: ${testMission.owner_id}`);
    console.log(`   Run this SQL to migrate the user:`);
    console.log(`   `);
    console.log(`   -- Get user from cloud and insert into local auth.users`);
    console.log(`   -- See instructions below`);
  }
  
  // Migrate each table
  for (const table of TABLES) {
    await migrateTable(table);
  }
  
  console.log('\n✅ Data migration to public schema complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Move data from public to drone schema (run the SQL below):');
  console.log('');
  console.log('   psql "postgresql://supabase_admin:postgres@localhost:54322/postgres" <<EOF');
  console.log('   SET search_path TO drone, tryon_schema, public;');
  console.log('   INSERT INTO drone.profiles SELECT * FROM public.profiles ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.missions SELECT * FROM public.missions ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.mission_waypoints SELECT * FROM public.mission_waypoints ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.flight_logs SELECT * FROM public.flight_logs ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.flight_log_data_points SELECT * FROM public.flight_log_data_points ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.flight_log_warnings_errors SELECT * FROM public.flight_log_warnings_errors ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.battery_labels SELECT * FROM public.battery_labels ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.fleet_drones SELECT * FROM public.fleet_drones ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.battery_stats SELECT * FROM public.battery_stats ON CONFLICT DO NOTHING;');
  console.log('   INSERT INTO drone.orthomosaic_projects SELECT * FROM public.orthomosaic_projects ON CONFLICT DO NOTHING;');
  console.log('   EOF');
  console.log('');
  console.log('2. Verify data in Supabase Studio: http://localhost:54323/');
  console.log('3. Check row counts match between cloud and local');
  console.log('4. Update environment variables to point to local Supabase');
}

main().catch(console.error);
