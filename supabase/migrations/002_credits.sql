-- ============================================================================
-- 002: Credit-Based Billing Schema
-- Adds credit tracking to profiles and usage audit log
-- ============================================================================

-- Add credit columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS credits_remaining INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS credits_monthly INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;

-- Update existing pro users to have pro credits
UPDATE profiles SET credits_monthly = 2000, credits_remaining = 2000 WHERE plan = 'pro';

-- Usage events audit log
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'generation')),
  model TEXT NOT NULL DEFAULT 'gpt-5.2',
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  stripe_meter_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_select ON usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY usage_events_insert ON usage_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes for querying usage history
CREATE INDEX idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at DESC);

-- RPC: Atomic credit deduction + usage logging
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_project_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT 'gpt-5.2',
  p_event_type TEXT DEFAULT 'generation',
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_tokens_total INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE profiles
    SET credits_remaining = credits_remaining - p_credits
    WHERE id = p_user_id
    RETURNING credits_remaining INTO v_remaining;

  INSERT INTO usage_events (
    user_id, project_id, event_type, model,
    tokens_input, tokens_output, tokens_total, credits_used
  ) VALUES (
    p_user_id, p_project_id, p_event_type, p_model,
    p_tokens_input, p_tokens_output, p_tokens_total, p_credits
  );

  RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
