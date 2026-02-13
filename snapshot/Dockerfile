FROM oven/bun:1-debian

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Pre-cache common deps (includes PGlite for migration validation)
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

CMD ["sleep", "infinity"]
