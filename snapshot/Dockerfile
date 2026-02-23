FROM oven/bun:1-debian

# System deps: git, curl, tmux (entrypoint uses tmux for dev server session)
RUN apt-get update && apt-get install -y git curl tmux && rm -rf /var/lib/apt/lists/*

# Install OpenVSCode Server (VS Code in the browser)
# Provides in-browser IDE on port 13337 for the Code tab
ARG OPENVSCODE_RELEASE=v1.106.3
RUN curl -fsSL "https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-${OPENVSCODE_RELEASE}/openvscode-server-${OPENVSCODE_RELEASE}-linux-x64.tar.gz" \
    | tar xz -C /opt \
    && mv "/opt/openvscode-server-${OPENVSCODE_RELEASE}-linux-x64" /opt/openvscode-server

# Install OxLint globally — single Rust binary, much lighter than ESLint + plugins
RUN bun install -g oxlint

# Pre-cache common deps for static Vite + React + Tailwind apps
WORKDIR /workspace
COPY package-base.json /workspace/package.json
RUN bun install

# Pre-warm Vite + TypeScript caches with minimal scaffold
# Creates .vite/ dep pre-bundle and tsconfig.tsbuildinfo
# Saves ~5-10s on first dev server start and tsc --noEmit
COPY warmup-scaffold/ /workspace/
RUN bun add -g typescript
RUN bun run dev & DEV_PID=$! && sleep 8 && kill $DEV_PID 2>/dev/null; \
    test -d node_modules/.vite || (echo "FATAL: Vite dep pre-bundle failed" && exit 1)
RUN tsc --noEmit

# Entrypoint starts dev server (tmux) + OpenVSCode Server (foreground)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
