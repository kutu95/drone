#!/usr/bin/env npx tsx
/**
 * Migrate Storage buckets (e.g. photo-thumbnails) from source Supabase to target.
 * Uses .env.local for source and .env.production.local for target.
 *
 * Run from project root:
 *   npx tsx scripts/migrate-storage-buckets.ts
 *   npx tsx scripts/migrate-storage-buckets.ts photo-thumbnails photo-originals
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * in .env.local (source) and .env.production.local (target).
 * For target, we read URL/key from .env.production.local (same var names = target config).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadEnv(file: string): Record<string, string> {
  const p = path.join(PROJECT_ROOT, file);
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  const content = fs.readFileSync(p, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].replace(/^["']|["']\s*$/g, '').trim();
    if (v.endsWith('\r')) v = v.slice(0, -1);
    out[m[1]] = v;
  }
  return out;
}

async function listAllPaths(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 1000;

  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix || '', {
      limit,
      offset,
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

      // Detect folder: if listing this path returns children, treat as folder and recurse
      const { data: sub } = await supabase.storage.from(bucket).list(fullPath, { limit: 1 });
      const isFolder = Array.isArray(sub) && sub.length > 0;

      if (isFolder) {
        const subFiles = await listAllPaths(supabase, bucket, fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    if (data.length < limit) break;
    offset += data.length;
  }
  return files;
}

async function migrateBucket(
  source: SupabaseClient,
  target: SupabaseClient,
  bucketName: string,
  dryRun: boolean
): Promise<{ copied: number; errors: string[] }> {
  console.log(`\n--- Bucket: ${bucketName} ---`);
  const paths = await listAllPaths(source, bucketName, '');
  console.log(`  Found ${paths.length} objects`);
  if (paths.length === 0) return { copied: 0, errors: [] };

  const errors: string[] = [];
  let copied = 0;
  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    if (dryRun) {
      console.log(`  [dry-run] ${filePath}`);
      copied++;
      continue;
    }
    try {
      const { data: blob, error: downErr } = await source.storage.from(bucketName).download(filePath);
      if (downErr || !blob) {
        errors.push(`${filePath}: download ${downErr?.message ?? 'no data'}`);
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await target.storage.from(bucketName).upload(filePath, buf, {
        upsert: true,
        contentType: blob.type || undefined,
      });
      if (upErr) {
        errors.push(`${filePath}: upload ${upErr.message}`);
        continue;
      }
      copied++;
      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${paths.length} ...`);
    } catch (e) {
      errors.push(`${filePath}: ${String(e)}`);
    }
  }
  console.log(`  Copied: ${copied}${errors.length ? `, errors: ${errors.length}` : ''}`);
  return { copied, errors };
}

async function ensureBucket(supabase: SupabaseClient, bucketName: string): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === bucketName)) return;
  const { error } = await supabase.storage.createBucket(bucketName, { public: true });
  if (error) console.warn(`Could not create bucket ${bucketName} on target: ${error.message}`);
}

function main() {
  const sourceEnv = loadEnv('.env.local');
  const targetEnv = loadEnv('.env.production.local');

  const sourceUrl = sourceEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    sourceEnv.SUPABASE_SERVICE_ROLE_KEY ||
    sourceEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const targetUrl =
    targetEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const targetKey =
    targetEnv.SUPABASE_SERVICE_ROLE_KEY ||
    targetEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.TARGET_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!sourceUrl || !sourceKey) {
    console.error('Source: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local');
    process.exit(1);
  }
  if (!targetUrl || !targetKey) {
    console.error('Target: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.production.local');
    process.exit(1);
  }

  const buckets = process.argv.slice(2).filter((b) => !b.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const toMigrate = buckets.length ? buckets : ['photo-thumbnails'];

  const source = createClient(sourceUrl, sourceKey);
  const target = createClient(targetUrl, targetKey);

  console.log('Source:', sourceUrl);
  console.log('Target:', targetUrl);
  console.log('Buckets:', toMigrate.join(', '), dryRun ? '(dry-run)' : '');

  (async () => {
    for (const bucket of toMigrate) {
      await ensureBucket(target, bucket);
      const { copied, errors } = await migrateBucket(source, target, bucket, dryRun);
      if (errors.length) errors.forEach((e) => console.error('  ', e));
    }
    console.log('\nDone.');
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

main();
