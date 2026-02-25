#!/usr/bin/env bash
# scripts/update-claude-md.sh
#
# Automatically updates CLAUDE.md files based on code changes.
# Uses `claude` CLI (Claude Code) in print mode to analyze diffs
# and make targeted edits to affected CLAUDE.md documentation.
#
# Usage:
#   ./scripts/update-claude-md.sh              # Compare against upstream
#   ./scripts/update-claude-md.sh origin/main  # Compare against specific ref

set -euo pipefail

# ── Guards ──────────────────────────────────────────────────────────

if ! command -v claude &>/dev/null; then
  echo "[claude-md] 'claude' CLI not found — skipping CLAUDE.md update"
  echo "[claude-md] Install: https://docs.anthropic.com/en/docs/claude-code"
  exit 0
fi

# ── Determine base ref ──────────────────────────────────────────────
BASE_REF="${1:-}"
if [ -z "$BASE_REF" ]; then
  BASE_REF=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo 'origin/main')
fi

# Verify the base ref exists
if ! git rev-parse --verify "$BASE_REF" &>/dev/null; then
  echo "[claude-md] Base ref '$BASE_REF' not found — skipping"
  exit 0
fi

# ── Collect changed files (exclude CLAUDE.md themselves + node_modules) ─
CHANGED_FILES=$(git diff --name-only "$BASE_REF"...HEAD \
  -- . ':!*CLAUDE.md' ':!node_modules' ':!*.lock' ':!package-lock.json' \
  2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "[claude-md] No code changes detected — CLAUDE.md files are up to date."
  exit 0
fi

FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

# ── Find all CLAUDE.md files in the repo ────────────────────────────
REPO_ROOT=$(git rev-parse --show-toplevel)
CLAUDE_MDS=$(find "$REPO_ROOT" -name 'CLAUDE.md' \
  -not -path '*/node_modules/*' \
  -not -path '*/.worktrees/*' \
  -not -path '*/.git/*' | sort)

if [ -z "$CLAUDE_MDS" ]; then
  echo "[claude-md] No CLAUDE.md files found in repo."
  exit 0
fi

# ── Map changed files to their nearest CLAUDE.md scope ──────────────
# Use a temp directory instead of associative arrays (bash 3 compat)
SCOPE_DIR=$(mktemp -d)
trap 'rm -rf "$SCOPE_DIR"' EXIT

for file in $CHANGED_FILES; do
  abs_file="$REPO_ROOT/$file"
  dir=$(dirname "$abs_file")

  # Walk up directories to find nearest CLAUDE.md
  found=""
  while [ "$dir" != "$REPO_ROOT" ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/CLAUDE.md" ]; then
      found="$dir"
      break
    fi
    dir=$(dirname "$dir")
  done

  # Fall back to root CLAUDE.md
  if [ -z "$found" ] && [ -f "$REPO_ROOT/CLAUDE.md" ]; then
    found="$REPO_ROOT"
  fi

  if [ -n "$found" ]; then
    # Use md5/shasum of path as filename to avoid slash issues
    scope_key=$(echo "$found" | shasum | cut -d' ' -f1)
    echo "$found" > "$SCOPE_DIR/${scope_key}.path"
    echo "$file" >> "$SCOPE_DIR/${scope_key}.files"
  fi
done

SCOPE_COUNT=$(find "$SCOPE_DIR" -name '*.path' | wc -l | tr -d ' ')
if [ "$SCOPE_COUNT" -eq 0 ]; then
  echo "[claude-md] No CLAUDE.md scopes affected."
  exit 0
fi

echo "[claude-md] $FILE_COUNT changed files across $SCOPE_COUNT CLAUDE.md scopes"

# ── Build prompt for Claude ─────────────────────────────────────────
PROMPT="You are a documentation maintainer for a codebase. Your job is to update CLAUDE.md files to reflect recent code changes.

RULES:
- Read each affected CLAUDE.md file first, then make targeted edits using the Edit tool
- Only update sections affected by the changes. Keep existing accurate content.
- Do NOT add timestamps, 'last updated' markers, or changelog entries
- Do NOT add new sections unless the changes introduce entirely new concepts
- Match the existing style and format of each CLAUDE.md
- If a CLAUDE.md is already accurate (changes don't affect documented content), skip it
- Be concise — CLAUDE.md files are reference docs, not narratives
- Update file lists, route maps, key patterns, and gotchas as needed
- If files were added/removed/renamed, update the Files section accordingly

Recent commits:
$(git log --oneline "$BASE_REF"...HEAD 2>/dev/null | head -30)

"

for path_file in "$SCOPE_DIR"/*.path; do
  [ -f "$path_file" ] || continue
  scope=$(cat "$path_file")
  scope_key=$(basename "$path_file" .path)
  files=$(cat "$SCOPE_DIR/${scope_key}.files")

  # Make scope path relative to repo root for readability
  rel_scope="${scope#"$REPO_ROOT"/}"
  if [ "$scope" = "$REPO_ROOT" ]; then
    rel_scope="(root)"
  fi

  PROMPT+="
---
## Scope: $rel_scope/CLAUDE.md

Changed files in this scope:
$files
Diff summary (truncated to 300 lines):
$(git diff "$BASE_REF"...HEAD -- "$scope/" 2>/dev/null | head -300)

"
done

PROMPT+="
---
Now read each affected CLAUDE.md and make targeted updates. Use the Edit tool for changes. If a CLAUDE.md needs no changes, say so and move on."

# ── Invoke Claude ───────────────────────────────────────────────────
echo "[claude-md] Invoking Claude to analyze changes and update docs..."

# Use claude in print mode with restricted tools and a model appropriate for docs
echo "$PROMPT" | claude -p \
  --allowedTools "Read,Edit,Glob,Grep" \
  --model sonnet \
  --max-turns 30 \
  2>/dev/null || {
    echo "[claude-md] Claude invocation failed (non-fatal) — skipping update"
    exit 0
  }

# ── Check for modifications ─────────────────────────────────────────
MODIFIED_DOCS=$(git diff --name-only | grep 'CLAUDE.md' || true)

if [ -z "$MODIFIED_DOCS" ]; then
  echo "[claude-md] All CLAUDE.md files are up to date."
  exit 0
fi

# ── Commit the updates ──────────────────────────────────────────────
echo ""
echo "[claude-md] Updated:"
echo "$MODIFIED_DOCS" | while read -r f; do echo "  - $f"; done

git add $MODIFIED_DOCS

git commit -m "$(cat <<'EOF'
docs: auto-update CLAUDE.md files

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

echo ""
echo "[claude-md] Committed CLAUDE.md updates. Push again to include them."
exit 1  # Abort the current push — user re-pushes with the doc commit
