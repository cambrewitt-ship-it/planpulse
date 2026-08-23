/**
 * Aggregates client_ad_demographics rows into unified age/gender/country
 * views for the Client Hub demographics chart. Called as a sibling to
 * getClientHubData() (not folded into it) by both the authenticated and
 * public hub routes, same shared-aggregator principle.
 *
 * Meta reports age×gender jointly ('age_gender', e.g. '25-34|female') plus
 * 'country'. Google's age_range_view/gender_view report age and gender as
 * separate breakdowns with their own enum label formats, and Google has no
 * country breakdown wired up (v1) — this file normalizes all of that into
 * one consistent label set per dimension.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DemographicBucket {
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  pct: number;
}

export interface ClientDemographics {
  age: DemographicBucket[];
  gender: DemographicBucket[];
  country: DemographicBucket[];
  hasData: boolean;
}

interface DemoRow {
  breakdown_type: string;
  breakdown_value: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
}

const AGE_ORDER = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown'];

function normalizeAge(raw: string): string {
  const m = /^AGE_RANGE_(\d+)_(\d+|UP)$/.exec(raw);
  if (m) return m[2] === 'UP' ? `${m[1]}+` : `${m[1]}-${m[2]}`;
  if (/UNDETERMINED/.test(raw)) return 'Unknown';
  return raw || 'Unknown';
}

function normalizeGender(raw: string): string {
  const v = raw.toUpperCase();
  if (v === 'MALE' || v === 'FEMALE') return v.charAt(0) + v.slice(1).toLowerCase();
  return 'Unknown';
}

function accumulate(map: Map<string, { spend: number; impressions: number; clicks: number }>, key: string, row: DemoRow) {
  const cur = map.get(key) ?? { spend: 0, impressions: 0, clicks: 0 };
  cur.spend += Number(row.spend || 0);
  cur.impressions += Number(row.impressions || 0);
  cur.clicks += Number(row.clicks || 0);
  map.set(key, cur);
}

function toBuckets(map: Map<string, { spend: number; impressions: number; clicks: number }>, sortOrder?: string[]): DemographicBucket[] {
  const totalSpend = [...map.values()].reduce((s, v) => s + v.spend, 0);
  const totalImpressions = [...map.values()].reduce((s, v) => s + v.impressions, 0);
  const weight = totalSpend > 0 ? 'spend' : 'impressions';
  const total = weight === 'spend' ? totalSpend : totalImpressions;

  const buckets = [...map.entries()].map(([label, v]) => ({
    label, spend: v.spend, impressions: v.impressions, clicks: v.clicks,
    pct: total > 0 ? (v[weight] / total) * 100 : 0,
  }));

  if (sortOrder) {
    buckets.sort((a, b) => {
      const ia = sortOrder.indexOf(a.label);
      const ib = sortOrder.indexOf(b.label);
      return (ia === -1 ? sortOrder.length : ia) - (ib === -1 ? sortOrder.length : ib);
    });
  } else {
    buckets.sort((a, b) => b.pct - a.pct);
  }
  return buckets;
}

export async function getClientDemographics(
  supabase: SupabaseClient,
  clientId: string,
  options: { start: string; end: string },
): Promise<ClientDemographics> {
  const { data: rows } = await supabase
    .from('client_ad_demographics')
    .select('breakdown_type, breakdown_value, spend, impressions, clicks')
    .eq('client_id', clientId)
    .gte('date', options.start)
    .lte('date', options.end);

  const ageMap = new Map<string, { spend: number; impressions: number; clicks: number }>();
  const genderMap = new Map<string, { spend: number; impressions: number; clicks: number }>();
  const countryMap = new Map<string, { spend: number; impressions: number; clicks: number }>();

  for (const row of (rows ?? []) as DemoRow[]) {
    if (row.breakdown_type === 'age_gender') {
      const [rawAge, rawGender] = row.breakdown_value.split('|');
      accumulate(ageMap, normalizeAge(rawAge ?? ''), row);
      accumulate(genderMap, normalizeGender(rawGender ?? ''), row);
    } else if (row.breakdown_type === 'age') {
      accumulate(ageMap, normalizeAge(row.breakdown_value), row);
    } else if (row.breakdown_type === 'gender') {
      accumulate(genderMap, normalizeGender(row.breakdown_value), row);
    } else if (row.breakdown_type === 'country') {
      accumulate(countryMap, row.breakdown_value || 'Unknown', row);
    }
  }

  const age = toBuckets(ageMap, AGE_ORDER);
  const gender = toBuckets(genderMap, ['Male', 'Female', 'Unknown']);
  const country = toBuckets(countryMap).slice(0, 8);

  return { age, gender, country, hasData: (rows?.length ?? 0) > 0 };
}
