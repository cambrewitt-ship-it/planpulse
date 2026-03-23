-- Add benchmarks feature: metric_presets and channel_benchmarks tables

-- TABLE 1: metric_presets
-- Stores named presets of metrics per channel (e.g. "Meta — Traffic", "Meta — Conversions")
CREATE TABLE IF NOT EXISTS metric_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_name text NOT NULL,
  is_custom boolean DEFAULT false,
  metrics text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE metric_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read metric_presets"
  ON metric_presets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert metric_presets"
  ON metric_presets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update metric_presets"
  ON metric_presets FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete metric_presets"
  ON metric_presets FOR DELETE
  TO authenticated
  USING (true);

-- TABLE 2: channel_benchmarks
-- Stores global benchmark values per channel per metric
CREATE TABLE IF NOT EXISTS channel_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  benchmark_value numeric NOT NULL,
  unit text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better')),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (channel_name, metric_key)
);

ALTER TABLE channel_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read channel_benchmarks"
  ON channel_benchmarks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert channel_benchmarks"
  ON channel_benchmarks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update channel_benchmarks"
  ON channel_benchmarks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete channel_benchmarks"
  ON channel_benchmarks FOR DELETE
  TO authenticated
  USING (true);
