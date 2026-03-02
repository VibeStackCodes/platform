FROM oven/bun:1-debian

# System deps: git, curl, tmux (entrypoint uses tmux for dev server session)
RUN apt-get update && apt-get install -y git curl tmux && rm -rf /var/lib/apt/lists/*

# Install OpenVSCode Server (VS Code in the browser)
ARG OPENVSCODE_RELEASE=v1.106.3
RUN curl -fsSL "https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-${OPENVSCODE_RELEASE}/openvscode-server-${OPENVSCODE_RELEASE}-linux-x64.tar.gz" \
    | tar xz -C /opt \
    && mv "/opt/openvscode-server-${OPENVSCODE_RELEASE}-linux-x64" /opt/openvscode-server

# Install OxLint globally — single Rust binary, much lighter than ESLint + plugins
RUN bun install -g oxlint

# Git identity for agent commits
RUN git config --global user.email "agent@vibestack.app" \
    && git config --global user.name "VibeStack Agent"

WORKDIR /workspace

# Clone template repo — proper git history, not git init
# All scaffold code (46 shadcn/ui components, React 19, Vite 7, Tailwind v4) lives here
ARG TEMPLATE_REPO=https://github.com/VibeStackCodes/vibestack-template.git
RUN git clone --depth 1 ${TEMPLATE_REPO} . \
    && rm -rf .git \
    && git init -b main \
    && git add -A \
    && git commit -m "Initial commit"

# Overlay local scaffold files (vite.config, etc.) on top of template repo
# scaffold/ is the source of truth — template repo may lag behind
COPY scaffold/vite.config.ts /workspace/vite.config.ts

# Install dependencies from committed lockfile (deterministic, no resolution needed)
RUN bun install --frozen-lockfile

# Warm Vite cache by running a dev build
# Creates .vite/ dep pre-bundle — saves ~5-10s on first dev server start
# optimizeDeps.include in vite.config.ts ensures ALL deps are pre-bundled here
RUN timeout 30 bun run dev &>/dev/null & sleep 10 && kill %1 2>/dev/null || true

# Warm TypeScript cache
RUN bunx tsc --noEmit 2>/dev/null || true

# Set up entrypoint and bashrc extras
COPY entrypoint.sh /entrypoint.sh
COPY bashrc-extra.sh /root/.bashrc-extra
RUN chmod +x /entrypoint.sh && echo '. /root/.bashrc-extra' >> /root/.bashrc

EXPOSE 3000 13337

ENTRYPOINT ["/entrypoint.sh"]
