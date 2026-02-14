#!/bin/bash
# VibeStack sandbox entrypoint
# Starts OpenVSCode Server (IDE) + bun dev server in tmux

# Start bun dev server in a tmux session with auto-restart on crash
# During generation, file writes can cause Vite to crash temporarily
tmux new-session -d -s dev -c /workspace 'while true; do bun run dev --host 0.0.0.0 2>&1 | tee /tmp/dev.log; echo "[entrypoint] dev server exited, restarting in 2s..."; sleep 2; done'

# Start OpenVSCode Server on port 13337 (foreground — keeps container alive)
exec /opt/openvscode-server/bin/openvscode-server \
  --host 0.0.0.0 \
  --port 13337 \
  --without-connection-token \
  --default-folder /workspace
