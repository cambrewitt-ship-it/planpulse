import type { MetricPresetInsert, ChannelBenchmarkInsert } from '@/types/database';

export const PRESET_SEEDS: MetricPresetInsert[] = [
  // Meta Ads
  {
    channel_name: 'Meta Ads',
    name: 'Traffic',
    is_custom: false,
    metrics: ['clicks', 'ctr', 'cpc', 'reach', 'impressions'],
  },
  {
    channel_name: 'Meta Ads',
    name: 'Conversions',
    is_custom: false,
    metrics: ['conversions', 'cpa', 'roas', 'ctr', 'cpc'],
  },
  {
    channel_name: 'Meta Ads',
    name: 'Awareness',
    is_custom: false,
    metrics: ['reach', 'impressions', 'cpm', 'frequency', 'ctr'],
  },
  {
    channel_name: 'Meta Ads',
    name: 'Custom',
    is_custom: true,
    metrics: [],
  },

  // Google Ads
  {
    channel_name: 'Google Ads',
    name: 'Search — Traffic',
    is_custom: false,
    metrics: ['clicks', 'ctr', 'cpc', 'impressions', 'quality_score'],
  },
  {
    channel_name: 'Google Ads',
    name: 'Search — Conversions',
    is_custom: false,
    metrics: ['conversions', 'cpa', 'roas', 'ctr', 'cpc'],
  },
  {
    channel_name: 'Google Ads',
    name: 'Display',
    is_custom: false,
    metrics: ['impressions', 'cpm', 'ctr', 'reach', 'frequency'],
  },
  {
    channel_name: 'Google Ads',
    name: 'Custom',
    is_custom: true,
    metrics: [],
  },
];

export const BENCHMARK_SEEDS: ChannelBenchmarkInsert[] = [
  // Meta Ads
  { channel_name: 'Meta Ads', metric_key: 'clicks',      metric_label: 'Clicks',      benchmark_value: 1000,  unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Meta Ads', metric_key: 'ctr',         metric_label: 'CTR',         benchmark_value: 1.2,   unit: '%', direction: 'higher_is_better' },
  { channel_name: 'Meta Ads', metric_key: 'cpc',         metric_label: 'CPC',         benchmark_value: 1.50,  unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Meta Ads', metric_key: 'cpm',         metric_label: 'CPM',         benchmark_value: 8.00,  unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Meta Ads', metric_key: 'reach',       metric_label: 'Reach',       benchmark_value: 10000, unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Meta Ads', metric_key: 'impressions', metric_label: 'Impressions', benchmark_value: 50000, unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Meta Ads', metric_key: 'frequency',   metric_label: 'Frequency',   benchmark_value: 3.0,   unit: 'x', direction: 'lower_is_better'  },
  { channel_name: 'Meta Ads', metric_key: 'conversions', metric_label: 'Conversions', benchmark_value: 50,    unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Meta Ads', metric_key: 'cpa',         metric_label: 'CPA',         benchmark_value: 30.00, unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Meta Ads', metric_key: 'roas',        metric_label: 'ROAS',        benchmark_value: 3.0,   unit: 'x', direction: 'higher_is_better' },

  // Google Ads (Search)
  { channel_name: 'Google Ads', metric_key: 'clicks',        metric_label: 'Clicks',        benchmark_value: 800,   unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Google Ads', metric_key: 'ctr',           metric_label: 'CTR',           benchmark_value: 5.0,   unit: '%', direction: 'higher_is_better' },
  { channel_name: 'Google Ads', metric_key: 'cpc',           metric_label: 'CPC',           benchmark_value: 2.50,  unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Google Ads', metric_key: 'impressions',   metric_label: 'Impressions',   benchmark_value: 20000, unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Google Ads', metric_key: 'conversions',   metric_label: 'Conversions',   benchmark_value: 40,    unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Google Ads', metric_key: 'cpa',           metric_label: 'CPA',           benchmark_value: 35.00, unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Google Ads', metric_key: 'roas',          metric_label: 'ROAS',          benchmark_value: 4.0,   unit: 'x', direction: 'higher_is_better' },
  { channel_name: 'Google Ads', metric_key: 'quality_score', metric_label: 'Quality Score', benchmark_value: 7,     unit: '',  direction: 'higher_is_better' },

  // Google Display
  { channel_name: 'Google Display', metric_key: 'impressions', metric_label: 'Impressions', benchmark_value: 100000, unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Google Display', metric_key: 'cpm',         metric_label: 'CPM',         benchmark_value: 4.00,   unit: '$', direction: 'lower_is_better'  },
  { channel_name: 'Google Display', metric_key: 'ctr',         metric_label: 'CTR',         benchmark_value: 0.35,   unit: '%', direction: 'higher_is_better' },
  { channel_name: 'Google Display', metric_key: 'reach',       metric_label: 'Reach',       benchmark_value: 40000,  unit: '',  direction: 'higher_is_better' },
  { channel_name: 'Google Display', metric_key: 'frequency',   metric_label: 'Frequency',   benchmark_value: 4.0,    unit: 'x', direction: 'lower_is_better'  },
];
