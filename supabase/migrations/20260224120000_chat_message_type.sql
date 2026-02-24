-- Add type discriminator to chat_messages for unified conversation model
ALTER TABLE chat_messages ADD COLUMN type text NOT NULL DEFAULT 'message';

-- Index for efficient project + type queries
CREATE INDEX idx_chat_messages_project_type ON chat_messages (project_id, type);
