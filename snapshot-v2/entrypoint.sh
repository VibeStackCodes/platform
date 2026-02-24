#!/bin/bash
# Start dev server in background
cd /workspace
bun run dev &

# Keep container running
exec sleep infinity
