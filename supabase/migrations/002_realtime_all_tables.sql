-- Enable realtime on all tables
-- projects already added in 001_init.sql
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
