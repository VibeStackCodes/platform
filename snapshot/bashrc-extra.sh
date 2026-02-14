# Auto-attach to dev server tmux session if it exists and we're not already in tmux
if [ -z "$TMUX" ] && tmux has-session -t dev 2>/dev/null; then
  exec tmux attach -t dev
fi
