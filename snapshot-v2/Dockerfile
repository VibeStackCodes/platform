# Lovable-style scaffold: all deps pre-installed, caches warmed
FROM oven/bun:1-debian

WORKDIR /workspace

# Install system deps
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Copy scaffold files
COPY scaffold/ /workspace/

# Install all dependencies
RUN bun install --frozen-lockfile || bun install

# Install ALL shadcn/ui components
RUN bunx --bun shadcn@latest add --all --yes --overwrite

# Warm Vite cache by running a dev build
RUN timeout 30 bun run dev &>/dev/null & sleep 10 && kill %1 2>/dev/null || true

# Warm TypeScript cache
RUN bunx tsc --noEmit 2>/dev/null || true

# Initialize git repo (LLM commits into this)
RUN git init && git add -A && git commit -m "scaffold: vibestack-v2-template"

# Set up entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 13337

ENTRYPOINT ["/entrypoint.sh"]
