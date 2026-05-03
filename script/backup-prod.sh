#!/usr/bin/env bash
# Snapshot the production Postgres database to a local file.
#
# Output: backups/prod-YYYYMMDD-HHMMSSZ.dump  (gitignored)
# Format: pg_dump custom format, gzip-9 compressed, no owner / no privileges
#         so it restores cleanly into any database regardless of role names.
#
# Requires: PROD_DATABASE_URL in env, pg_dump on PATH (matching prod major).
# Usage:    bash script/backup-prod.sh
set -euo pipefail

if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "ERROR: PROD_DATABASE_URL is not set." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${REPO_ROOT}/backups"
mkdir -p "${BACKUP_DIR}"

TS="$(date -u +%Y%m%d-%H%M%SZ)"
OUT="${BACKUP_DIR}/prod-${TS}.dump"

echo "Dumping prod -> ${OUT}"
NODE_TLS_REJECT_UNAUTHORIZED=0 PGSSLMODE=require pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="${OUT}" \
  "${PROD_DATABASE_URL}"

SIZE="$(du -h "${OUT}" | cut -f1)"
SHA="$(sha256sum "${OUT}" | cut -d' ' -f1)"
TABLES="$(pg_restore --list "${OUT}" | grep -c " TABLE DATA " || true)"

echo ""
echo "OK"
echo "  file:   ${OUT}"
echo "  size:   ${SIZE}"
echo "  sha256: ${SHA}"
echo "  tables with data: ${TABLES}"
echo ""
echo "Restore (fresh local DB):"
echo "  createdb workforce_restore"
echo "  pg_restore --no-owner --no-privileges --clean --if-exists \\"
echo "    -d postgresql://localhost/workforce_restore ${OUT}"
echo ""

# ─── Optional: off-Replit copy to AWS S3 ──────────────────────────────────
# Uncomment + set BACKUP_S3_BUCKET to enable. Requires AWS_ACCESS_KEY_ID and
# AWS_SECRET_ACCESS_KEY in env (already present for Rekognition). The aws
# CLI must be installed (it is not by default — let me know if you want it
# wired in).
#
# if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
#   echo "Uploading to s3://${BACKUP_S3_BUCKET}/$(basename "${OUT}") ..."
#   aws s3 cp "${OUT}" "s3://${BACKUP_S3_BUCKET}/$(basename "${OUT}")"
# fi
