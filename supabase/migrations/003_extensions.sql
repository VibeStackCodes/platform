-- ============================================================================
-- 003: Enable Required PostgreSQL Extensions
-- ============================================================================
-- vector:   Required by @mastra/pg PgVector for semantic recall (embeddings)
-- pgcrypto: Provides gen_random_uuid() on PG < 14 and cryptographic functions
-- Note: uuid-ossp already enabled in 001_init.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
