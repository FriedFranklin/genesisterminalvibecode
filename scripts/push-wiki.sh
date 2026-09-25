#!/usr/bin/env bash
# push-wiki.sh – Helper script to push the generated WIKI.md to the GitHub Wiki repository.
# Usage: REPO_URL="https://github.com/<owner>/<repo>.git" ./scripts/push-wiki.sh
# The script will:
#   1. Clone the wiki repository (repo.wiki.git) into a temporary directory.
#   2. Copy the local WIKI.md into the wiki repo as Home.md (or a custom page).
#   3. Commit and push the changes.
#   4. Clean up the temporary clone.

set -euo pipefail

if [[ -z "${REPO_URL:-}" ]]; then
  echo "Error: REPO_URL environment variable not set."
  echo "Example: REPO_URL=\"https://github.com/username/project.git\" $0"
  exit 1
fi

# Derive the wiki URL (GitHub appends .wiki.git)
WIKI_URL="${REPO_URL%.git}.wiki.git"
TMPDIR=$(mktemp -d)

echo "Cloning wiki repository from $WIKI_URL..."
git clone "$WIKI_URL" "$TMPDIR"

# Copy the generated wiki content. Adjust the target filename as needed.
# By default we replace the Home page.
cp "$(dirname "$0")/../WIKI.md" "$TMPDIR/Home.md"

cd "$TMPDIR"

git add Home.md
# Use a generic commit message; you can customize it.
git commit -m "Update project wiki (generated)"

echo "Pushing changes to the wiki..."
git push origin master

# Cleanup
cd ..
rm -rf "$TMPDIR"

echo "Wiki updated successfully."
