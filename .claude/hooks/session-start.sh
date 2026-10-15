#!/usr/bin/env bash
# Cloud-session setup: install dependencies and link the private personal
# repo in as docs/personal/, mirroring a laptop clone. No-op outside a
# Claude Code remote session. Usage: session-start.sh <repo-dir>
set -u

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
repo="$1"
cd "$repo" || exit 0

[ -d node_modules ] || npm ci

# The personal repo is cloned beside this one. The .gitignore pattern
# `docs/personal/` matches directories only, so exclude the symlink locally.
personal="../intervals-icu-personal"
if [ -d "$personal" ] && [ ! -e docs/personal ]; then
  ln -s "../$personal" docs/personal
  grep -qxF docs/personal .git/info/exclude 2>/dev/null ||
    echo docs/personal >> .git/info/exclude
fi

exit 0
