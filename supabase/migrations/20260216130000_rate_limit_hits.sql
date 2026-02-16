-- Rate limit tracking table for serverless-compatible rate limiting
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Index for fast lookups by key within time window
CREATE INDEX idx_rate_limit_hits_key_created ON rate_limit_hits (key, created_at DESC);
-- Index for cleanup of expired entries
CREATE INDEX idx_rate_limit_hits_expires ON rate_limit_hits (expires_at);

-- RLS: only service role can access
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
