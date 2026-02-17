-- Warm Supabase Project Pool
-- Maintains a pool of pre-provisioned Supabase projects for instant claiming

CREATE TABLE warm_supabase_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_project_id TEXT NOT NULL UNIQUE,
  supabase_url TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  service_role_key TEXT NOT NULL,
  db_host TEXT NOT NULL,
  db_password TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'us-east-1',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'creating', 'error')),
  claimed_by UUID,  -- No FK: pool is server-side infra, profiles may not exist yet
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);

-- Index for fast claiming queries
CREATE INDEX idx_warm_supabase_projects_status ON warm_supabase_projects(status);

-- RLS: Service role only (this table should never be accessed by end users)
ALTER TABLE warm_supabase_projects ENABLE ROW LEVEL SECURITY;

-- No policies = service role only
