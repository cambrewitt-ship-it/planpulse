import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { PRESET_SEEDS, BENCHMARK_SEEDS } from '../src/lib/seeds/benchmark-seed';

// Load .env.local from project root
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function seedBenchmarks() {
  console.log('Seeding channel_benchmarks...');

  const { error: benchmarkError } = await supabase
    .from('channel_benchmarks')
    .upsert(BENCHMARK_SEEDS, { onConflict: 'channel_name,metric_key' });

  if (benchmarkError) {
    console.error('Failed to seed channel_benchmarks:', benchmarkError.message);
    process.exit(1);
  }

  console.log(`✓ Upserted ${BENCHMARK_SEEDS.length} benchmark rows`);
}

async function seedPresets() {
  console.log('Seeding metric_presets...');

  // Remove existing non-custom presets (safe to re-seed; preserves user-created custom presets)
  const { error: deleteError } = await supabase
    .from('metric_presets')
    .delete()
    .eq('is_custom', false);

  if (deleteError) {
    console.error('Failed to clear existing presets:', deleteError.message);
    process.exit(1);
  }

  const nonCustom = PRESET_SEEDS.filter((p) => !p.is_custom);
  const { error: insertError } = await supabase
    .from('metric_presets')
    .insert(nonCustom);

  if (insertError) {
    console.error('Failed to insert metric_presets:', insertError.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${nonCustom.length} preset rows (custom presets preserved)`);
}

async function main() {
  await seedBenchmarks();
  await seedPresets();
  console.log('\nDone.');
}

main();
