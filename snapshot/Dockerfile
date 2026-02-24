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

# Pre-cache common deps for Vite + React + Tailwind apps
WORKDIR /workspace
COPY package-base.json /workspace/package.json
RUN bun install

# Copy full scaffold: src/ (App, pages, components/ui, hooks, lib), configs, index.html
COPY warmup-scaffold/ /workspace/

# Pre-warm Vite + TypeScript caches with the scaffold
# Creates .vite/ dep pre-bundle and tsconfig.tsbuildinfo
# Saves ~5-10s on first dev server start
RUN bun add -g typescript
RUN bun run dev & DEV_PID=$! && sleep 10 && kill $DEV_PID 2>/dev/null; \
    test -d /tmp/.vite || (echo "FATAL: Vite dep pre-bundle failed" && exit 1)

# Entrypoint starts dev server (tmux) + OpenVSCode Server (foreground)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
