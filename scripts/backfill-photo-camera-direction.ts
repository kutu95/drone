#!/usr/bin/env tsx
/**
 * One-off script: Backfill camera direction (heading_deg, gimbal_pitch_deg) for photo
 * records that are missing it, by interpolating from the same flight log's data points.
 *
 * Usage:
 *   npx tsx scripts/backfill-photo-camera-direction.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Report which records would be updated and counts only; do not write.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: BACKFILL_CAMERA_SCHEMA (default 'public')
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.BACKFILL_CAMERA_SCHEMA || 'public';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables.');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema },
  auth: { autoRefreshToken: false, persistSession: false },
});

const isDryRun = process.argv.includes('--dry-run');

type DataPoint = {
  timestamp_offset_ms: number;
  heading_deg: number | null;
  gimbal_pitch_deg: number | null;
};

/** Linear interpolate heading (handle 0/360 wrap). */
function interpolateHeading(t: number, t0: number, t1: number, h0: number, h1: number): number {
  if (t0 === t1) return h0;
  const ratio = (t - t0) / (t1 - t0);
  let d = h1 - h0;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = h0 + ratio * d;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}

/** Interpolate heading_deg and gimbal_pitch_deg at timestamp from sorted data points. */
function interpolateAt(
  timestampMs: number,
  points: DataPoint[]
): { heading_deg: number | null; gimbal_pitch_deg: number | null } {
  const sorted = [...points].sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms);
  if (sorted.length === 0) return { heading_deg: null, gimbal_pitch_deg: null };

  const hasHeading = sorted.some((p) => p.heading_deg != null);
  const hasGimbal = sorted.some((p) => p.gimbal_pitch_deg != null);
  if (!hasHeading && !hasGimbal) return { heading_deg: null, gimbal_pitch_deg: null };

  let prev = sorted[0];
  let next = sorted[sorted.length - 1];
  if (timestampMs <= prev.timestamp_offset_ms) {
    next = prev;
  } else if (timestampMs >= next.timestamp_offset_ms) {
    prev = next;
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].timestamp_offset_ms <= timestampMs && timestampMs <= sorted[i + 1].timestamp_offset_ms) {
        prev = sorted[i];
        next = sorted[i + 1];
        break;
      }
    }
  }

  let heading_deg: number | null = null;
  let gimbal_pitch_deg: number | null = null;

  if (hasHeading && prev.heading_deg != null && next.heading_deg != null) {
    heading_deg = interpolateHeading(
      timestampMs,
      prev.timestamp_offset_ms,
      next.timestamp_offset_ms,
      prev.heading_deg,
      next.heading_deg
    );
  } else if (hasHeading) {
    const p = prev.heading_deg != null ? prev : next;
    heading_deg = p.heading_deg;
  }

  if (hasGimbal && prev.gimbal_pitch_deg != null && next.gimbal_pitch_deg != null) {
    const ratio =
      prev.timestamp_offset_ms === next.timestamp_offset_ms
        ? 1
        : (timestampMs - prev.timestamp_offset_ms) / (next.timestamp_offset_ms - prev.timestamp_offset_ms);
    gimbal_pitch_deg = prev.gimbal_pitch_deg! * (1 - ratio) + next.gimbal_pitch_deg! * ratio;
  } else if (hasGimbal) {
    const p = prev.gimbal_pitch_deg != null ? prev : next;
    gimbal_pitch_deg = p.gimbal_pitch_deg;
  }

  return { heading_deg, gimbal_pitch_deg };
}

const PHOTO_PAGE_SIZE = 1000; // Supabase/PostgREST default max rows per query

async function main() {
  console.log('🔍 Finding photo records missing camera direction (heading_deg or gimbal_pitch_deg)...');
  console.log(`   Schema: ${schema}\n`);

  const toUpdate: Array<{ id: string; flight_log_id: string; timestamp_offset_ms: number; heading_deg: number | null; gimbal_pitch_deg: number | null }> = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error: photosError } = await supabase
      .from('flight_log_data_points')
      .select('id, flight_log_id, timestamp_offset_ms, heading_deg, gimbal_pitch_deg')
      .eq('is_photo', true)
      .or('heading_deg.is.null,gimbal_pitch_deg.is.null')
      .range(offset, offset + PHOTO_PAGE_SIZE - 1);

    if (photosError) {
      console.error('❌ Error fetching photo records:', photosError.message);
      process.exit(1);
    }

    const rows = page ?? [];
    toUpdate.push(...rows);
    hasMore = rows.length === PHOTO_PAGE_SIZE;
    offset += PHOTO_PAGE_SIZE;
    if (rows.length > 0) {
      console.log(`   Fetched ${toUpdate.length} photo(s) so far...`);
    }
  }

  if (toUpdate.length === 0) {
    console.log('✅ No photo records missing camera direction. Nothing to do.');
    return;
  }

  console.log(`   Total: ${toUpdate.length} photo(s) to consider.\n`);

  const byLog = new Map<string, typeof toUpdate>();
  for (const p of toUpdate) {
    const list = byLog.get(p.flight_log_id) ?? [];
    list.push(p);
    byLog.set(p.flight_log_id, list);
  }

  console.log(`📋 Found ${toUpdate.length} photo(s) in ${byLog.size} flight(s) to backfill.\n`);

  const flightLogIds = Array.from(byLog.keys());
  const pointsByLog = new Map<string, DataPoint[]>();

  for (const flightLogId of flightLogIds) {
    const { data: pts, error: e } = await supabase
      .from('flight_log_data_points')
      .select('timestamp_offset_ms, heading_deg, gimbal_pitch_deg')
      .eq('flight_log_id', flightLogId);
    if (!e && pts?.length) {
      pointsByLog.set(flightLogId, pts as DataPoint[]);
    }
  }

  const updates: { id: string; payload: Record<string, number | null> }[] = [];
  let skipped = 0;
  for (const photo of toUpdate) {
    const points = pointsByLog.get(photo.flight_log_id);
    if (!points?.length) {
      skipped++;
      continue;
    }
    const { heading_deg, gimbal_pitch_deg } = interpolateAt(photo.timestamp_offset_ms, points);
    const needHeading = photo.heading_deg == null && heading_deg != null;
    const needGimbal = photo.gimbal_pitch_deg == null && gimbal_pitch_deg != null;
    if (needHeading || needGimbal) {
      const payload: Record<string, number | null> = {};
      if (needHeading) payload.heading_deg = heading_deg;
      if (needGimbal) payload.gimbal_pitch_deg = gimbal_pitch_deg;
      updates.push({ id: photo.id, payload });
    } else {
      skipped++;
    }
  }

  if (skipped > 0) {
    console.log(`   (Skipped ${skipped} photo(s) — no interpolatable direction in that flight.)`);
  }

  if (updates.length === 0) {
    console.log('✅ No records could be backfilled (no direction data in flight points).');
    return;
  }

  console.log(`   Will update ${updates.length} photo record(s).\n`);

  if (isDryRun) {
    console.log('🔒 Dry run: no changes made. Run without --dry-run to apply.');
    return;
  }

  let updated = 0;
  const total = updates.length;
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error: upErr } = await supabase
      .from('flight_log_data_points')
      .update(u.payload)
      .eq('id', u.id);
    if (upErr) {
      console.error(`❌ Update failed for id ${u.id}:`, upErr.message);
    } else {
      updated++;
    }
    if ((i + 1) % 500 === 0 || i + 1 === total) {
      console.log(`   Updated ${i + 1}/${total}...`);
    }
  }

  console.log(`✅ Updated ${updated} photo record(s) with camera direction.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
