FROM daytonaio/base:latest

# Install Postgres 16
RUN apt-get update && apt-get install -y \
    postgresql-16 \
    postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Install GoTrue (Supabase Auth)
RUN curl -L https://github.com/supabase/gotrue/releases/latest/download/gotrue-linux-amd64 \
    -o /usr/local/bin/gotrue && chmod +x /usr/local/bin/gotrue

# Install PostgREST
RUN curl -L https://github.com/PostgREST/postgrest/releases/latest/download/postgrest-v12-linux-static-x64.tar.xz \
    | tar xJ -C /usr/local/bin/

# Supabase startup
COPY supabase-init.sh /usr/local/bin/supabase-init.sh
RUN chmod +x /usr/local/bin/supabase-init.sh

# Pre-cache common deps
WORKDIR /workspace
COPY package-base.json /workspace/package.json
RUN bun install

# Pre-warm Vite + TypeScript caches with minimal scaffold
# Creates .vite/ dep pre-bundle and tsconfig.tsbuildinfo
# Saves ~5-10s on first dev server start and tsc --noEmit
COPY warmup-scaffold/ /workspace/
RUN bun run dev &>/dev/null & DEV_PID=$! && sleep 8 && kill $DEV_PID 2>/dev/null || true
RUN npx tsc --noEmit 2>/dev/null || true
# Clean up warmup source but keep caches (.vite/, tsconfig.tsbuildinfo)
RUN rm -rf /workspace/src /workspace/index.html /workspace/env.d.ts \
    /workspace/vite.config.ts /workspace/tsconfig.json /workspace/tsconfig.app.json

CMD ["/usr/local/bin/supabase-init.sh"]
