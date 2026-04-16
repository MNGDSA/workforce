#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="dist/public"

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR directory not found"
  exit 1
fi

MATCHES=$(grep -ri "replit" "$DIST_DIR" --include="*.html" --include="*.js" --include="*.css" --include="*.json" -l 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: Found 'replit' references in production build:"
  echo "$MATCHES"
  echo ""
  grep -ri "replit" "$DIST_DIR" --include="*.html" --include="*.js" --include="*.css" --include="*.json" -n 2>/dev/null || true
  exit 1
fi

echo "Branding check passed: no 'replit' references found in $DIST_DIR"
