-- ============================================================================
-- VibeStack Platform Schema Migration
-- ============================================================================
-- Initial schema for VibeStack platform including projects and user profiles

-- ============================================================================
-- Enable Extensions
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
-- (RLS is enabled by default in Supabase, but we ensure it's available)

-- ============================================================================
-- Profiles Table
-- ============================================================================
-- User profile information including billing plan and Stripe customer ID

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own profile
CREATE POLICY "Users can view their own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- RLS Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policy: Users can insert their own profile (on signup)
CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create index on stripe_customer_id for webhook lookups
CREATE INDEX idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);

-- ============================================================================
-- Projects Table
-- ============================================================================
-- Stores generated application projects and their state

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'planning', 'generating', 'verifying', 'complete', 'error', 'deploying', 'deployed')
  ),
  plan JSONB,
  model TEXT,
  generation_state JSONB DEFAULT '{}'::jsonb,
  sandbox_id TEXT,
  supabase_project_id TEXT,
  preview_url TEXT,
  code_server_url TEXT,
  deploy_url TEXT,
  supabase_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own projects
CREATE POLICY "Users can view their own projects"
  ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own projects
CREATE POLICY "Users can insert their own projects"
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own projects
CREATE POLICY "Users can update their own projects"
  ON projects
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own projects
CREATE POLICY "Users can delete their own projects"
  ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for common queries
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================
-- Automatically update the updated_at timestamp when a project is modified

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Realtime Configuration
-- ============================================================================
-- Enable realtime updates for projects table

ALTER PUBLICATION supabase_realtime ADD TABLE projects;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profile information including billing plan';
COMMENT ON COLUMN profiles.plan IS 'User subscription plan: free or pro';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID for billing';

COMMENT ON TABLE projects IS 'Generated application projects and their generation state';
COMMENT ON COLUMN projects.status IS 'Current generation status: pending, planning, generating, verifying, complete, error, deploying, or deployed';
COMMENT ON COLUMN projects.generation_state IS 'JSON state object tracking generation progress';
COMMENT ON COLUMN projects.sandbox_id IS 'Daytona sandbox identifier';
COMMENT ON COLUMN projects.preview_url IS 'URL to preview the generated app';
COMMENT ON COLUMN projects.deploy_url IS 'URL to deployed production app';

-- ============================================================================
-- Profile Auto-Creation Trigger
-- ============================================================================
-- Automatically create a profile row when a new user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION public.create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_signup();

-- ============================================================================
-- Chat Messages Table
-- ============================================================================
-- Stores AI SDK UIMessage objects for chat persistence across page reloads

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,              -- AI SDK message ID (client-generated UUID)
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,               -- 'user' | 'assistant' | 'system'
  parts JSONB NOT NULL DEFAULT '[]', -- UIMessage.parts array
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_project ON chat_messages(project_id, created_at);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project messages"
  ON chat_messages FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own project messages"
  ON chat_messages FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own project messages"
  ON chat_messages FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ============================================================================
-- GitHub Persistence
-- ============================================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT;

-- ============================================================================
-- Supabase Credentials (for Vercel env var injection at deploy time)
-- ============================================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_anon_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_service_role_key TEXT;

-- Allow build_failed status
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
  status IN ('pending', 'planning', 'generating', 'verifying', 'complete', 'error', 'build_failed', 'deploying', 'deployed')
);
