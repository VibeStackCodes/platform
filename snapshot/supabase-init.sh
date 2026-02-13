#!/bin/bash
set -e

# Start Postgres
pg_ctlcluster 16 main start

# Create app database with extensions
su postgres -c "psql -c \"CREATE DATABASE app;\""
su postgres -c "psql -d app -c \"CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS uuid-ossp;\""

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_ROLE_KEY=$(openssl rand -hex 32)

# Write credentials for generated apps
cat > /workspace/.env.local <<EOF
VITE_SUPABASE_URL=http://localhost:3001
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
EOF

# Start GoTrue (auth) on port 9999
GOTRUE_DB_DATABASE_URL="postgres://postgres@localhost:5432/app?sslmode=disable" \
GOTRUE_JWT_SECRET="${JWT_SECRET}" \
GOTRUE_SITE_URL="http://localhost:3000" \
gotrue serve &

# Start PostgREST on port 3001
PGRST_DB_URI="postgres://postgres@localhost:5432/app" \
PGRST_DB_ANON_ROLE="anon" \
PGRST_JWT_SECRET="${JWT_SECRET}" \
PGRST_SERVER_PORT=3001 \
postgrest /dev/null &

echo "Supabase services ready"
exec tail -f /dev/null
