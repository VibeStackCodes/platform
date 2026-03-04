-- ============================================================================
-- Drop legacy chat_messages table
-- ============================================================================
--
-- WHY: Conversation data is now stored exclusively in Mastra Memory
-- (PostgresStore-managed tables). The chat_messages table was a legacy
-- fallback that is no longer read or written by any code path.
--
-- PREREQUISITES:
--   1. Verify no queries hit chat_messages: search codebase for 'chat_messages'
--   2. Confirm Mastra Memory has all historical conversations
--   3. Take a backup of chat_messages before dropping (pg_dump --table=chat_messages)
--
-- DO NOT APPLY THIS MIGRATION WITHOUT VERIFYING PREREQUISITES.
-- ============================================================================

BEGIN;

-- Remove from realtime publication first
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS chat_messages;

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view own project messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own project messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can update own project messages" ON chat_messages;

-- Drop indexes
DROP INDEX IF EXISTS idx_chat_messages_project;
DROP INDEX IF EXISTS idx_chat_messages_project_type;

-- Drop table
DROP TABLE IF EXISTS chat_messages;

COMMIT;
