-- User-configurable agents
CREATE TABLE IF NOT EXISTS user_agents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  system_prompt  text NOT NULL DEFAULT '',
  enabled_tools  text[] NOT NULL DEFAULT '{}',
  is_enabled     boolean NOT NULL DEFAULT true,
  is_template    boolean NOT NULL DEFAULT false,
  template_slug  text,
  icon           text,
  color          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agents_template_slug_user
  ON user_agents(user_id, template_slug)
  WHERE template_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON user_agents(user_id);

ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_agents_select" ON user_agents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_agents_insert" ON user_agents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_agents_update" ON user_agents
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_agents_delete" ON user_agents
  FOR DELETE USING (auth.uid() = user_id);


-- Agent run history with audit trail
CREATE TABLE IF NOT EXISTS agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES user_agents(id) ON DELETE SET NULL,
  agent_name    text NOT NULL,
  user_message  text NOT NULL,
  audit_trail   jsonb NOT NULL DEFAULT '[]',
  final_output  text,
  output_links  jsonb NOT NULL DEFAULT '[]',
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  status        text NOT NULL DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id  ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_select" ON agent_runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "agent_runs_insert" ON agent_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agent_runs_update" ON agent_runs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
