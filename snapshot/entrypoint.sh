#!/bin/bash
# VibeStack sandbox entrypoint
# Starts OpenVSCode Server (IDE) + bun dev server in tmux

# Start bun dev server in a tmux session so users can attach and see output
tmux new-session -d -s dev -c /workspace 'bun run dev --host 0.0.0.0 2>&1 | tee /tmp/dev.log'

# Start OpenVSCode Server on port 13337 (foreground — keeps container alive)
exec /opt/openvscode-server/bin/openvscode-server \
  --host 0.0.0.0 \
  --port 13337 \
  --without-connection-token \
  --default-folder /workspace
