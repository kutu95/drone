#!/usr/bin/env tsx
/**
 * One-off script: Remove duplicate photo records created for macOS metadata files (._*).
 * These are not real images and cause thumbnail errors; they duplicate the real photo record.
 *
 * Usage:
 *   npx tsx scripts/remove-duplicate-macos-photo-records.ts [--dry-run]
 *
 * Options:
 *   --dry-run  List matching records and count only; do not delete.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: REMOVE_DUPLICATE_PHOTOS_SCHEMA (default 'public'; use 'drone' for local Supabase)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env first, then .env.local so local overrides (Next.js convention)
dotenv.config();
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Default to public (hosted Supabase). Set REMOVE_DUPLICATE_PHOTOS_SCHEMA=drone for local.
const schema = process.env.REMOVE_DUPLICATE_PHOTOS_SCHEMA || 'public';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables.');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('Optional: REMOVE_DUPLICATE_PHOTOS_SCHEMA (default: public)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema },
  auth: { autoRefreshToken: false, persistSession: false },
});

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('🔍 Finding photo records with macOS metadata filenames (._*)...');
  console.log(`   Schema: ${schema}\n`);

  // Select ids (and optional details) where is_photo and photo_filename starts with '._'
  const { data: rows, error: selectError } = await supabase
    .from('flight_log_data_points')
    .select('id, flight_log_id, photo_filename')
    .eq('is_photo', true)
    .like('photo_filename', '._%');

  if (selectError) {
    console.error('❌ Error fetching records:', selectError.message);
    process.exit(1);
  }

  const count = rows?.length ?? 0;
  if (count === 0) {
    console.log('✅ No duplicate ._* photo records found. Nothing to remove.');
    return;
  }

  console.log(`📋 Found ${count} record(s) to remove (photo_filename starting with '._'):`);
  rows?.slice(0, 20).forEach((r) => console.log(`   - ${r.photo_filename} (id: ${r.id})`));
  if (count > 20) console.log(`   ... and ${count - 20} more.\n`);

  if (isDryRun) {
    console.log('🔒 Dry run: no changes made. Run without --dry-run to delete.');
    return;
  }

  const ids = rows!.map((r) => r.id);
  const { error: deleteError } = await supabase
    .from('flight_log_data_points')
    .delete()
    .in('id', ids);

  if (deleteError) {
    console.error('❌ Error deleting records:', deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Deleted ${count} duplicate ._* photo record(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
