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

CMD ["/usr/local/bin/supabase-init.sh"]
