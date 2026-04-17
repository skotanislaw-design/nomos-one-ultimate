#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Nomos One — Backup Script
# Creates a timestamped backup of MongoDB + document files
#
# Usage:
#   ./scripts/backup.sh                    # Backup to ./backups/
#   ./scripts/backup.sh /path/to/backups   # Backup to custom directory
#   BACKUP_KEEP_DAYS=30 ./scripts/backup.sh  # Keep backups for 30 days
#
# Cron (daily at 3 AM):
#   0 3 * * * cd /path/to/nomos-one && ./scripts/backup.sh >> /var/log/nomos-backup.log 2>&1
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="nomos_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

# Load env vars
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MONGO_USER="${MONGO_USER:-nomos_admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
DB_NAME="${DB_NAME:-nomos_one}"
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
DOCUMENT_VOLUME="nomos-one-fixed_document_data"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[BACKUP]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }

# ── Prepare ───────────────────────────────────────────────────────────────────
log "Starting Nomos One backup..."
mkdir -p "${BACKUP_PATH}"

# ── 1. MongoDB Dump ──────────────────────────────────────────────────────────
log "Dumping MongoDB database '${DB_NAME}'..."

if docker ps | grep -q nomos_mongo; then
    # Docker mode — dump from container
    if [ -n "${MONGO_PASSWORD}" ]; then
        docker exec nomos_mongo mongodump \
            --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
            --out=/tmp/mongodump \
            --quiet 2>/dev/null || {
            err "MongoDB dump failed"
            exit 1
        }
    else
        docker exec nomos_mongo mongodump \
            --db="${DB_NAME}" \
            --out=/tmp/mongodump \
            --quiet 2>/dev/null || {
            err "MongoDB dump failed"
            exit 1
        }
    fi
    docker cp nomos_mongo:/tmp/mongodump/${DB_NAME} "${BACKUP_PATH}/db"
    docker exec nomos_mongo rm -rf /tmp/mongodump
else
    # Direct mongodump (if running locally)
    if command -v mongodump &> /dev/null; then
        if [ -n "${MONGO_PASSWORD}" ]; then
            mongodump \
                --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${DB_NAME}?authSource=admin" \
                --out="${BACKUP_PATH}/db_dump" \
                --quiet
            mv "${BACKUP_PATH}/db_dump/${DB_NAME}" "${BACKUP_PATH}/db"
            rm -rf "${BACKUP_PATH}/db_dump"
        else
            mongodump --host="${MONGO_HOST}" --port="${MONGO_PORT}" --db="${DB_NAME}" \
                --out="${BACKUP_PATH}/db_dump" --quiet
            mv "${BACKUP_PATH}/db_dump/${DB_NAME}" "${BACKUP_PATH}/db"
            rm -rf "${BACKUP_PATH}/db_dump"
        fi
    else
        err "mongodump not found. Install MongoDB tools or use Docker."
        exit 1
    fi
fi

log "MongoDB dump completed"

# ── 2. Document Files ─────────────────────────────────────────────────────────
log "Backing up document files..."

if docker volume ls | grep -q "${DOCUMENT_VOLUME}"; then
    # Copy from Docker volume
    docker run --rm \
        -v "${DOCUMENT_VOLUME}:/source:ro" \
        -v "$(realpath ${BACKUP_PATH}):/backup" \
        alpine sh -c "cp -r /source /backup/documents" 2>/dev/null || {
        warn "Could not backup document volume. Trying alternative..."
        docker cp nomos_backend:/data/documents "${BACKUP_PATH}/documents" 2>/dev/null || {
            warn "Could not backup documents from container"
        }
    }
elif [ -d "/data/documents" ]; then
    cp -r /data/documents "${BACKUP_PATH}/documents"
else
    warn "Document storage not found — skipping"
fi

log "Document files backup completed"

# ── 3. Compress ──────────────────────────────────────────────────────────────
log "Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}/"
rm -rf "${BACKUP_NAME}/"

BACKUP_SIZE=$(du -sh "${BACKUP_NAME}.tar.gz" | cut -f1)
log "Backup created: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# ── 4. Cleanup Old Backups ───────────────────────────────────────────────────
if [ "${KEEP_DAYS}" -gt 0 ]; then
    OLD_COUNT=$(find "${BACKUP_DIR}" -name "nomos_backup_*.tar.gz" -mtime "+${KEEP_DAYS}" | wc -l)
    if [ "${OLD_COUNT}" -gt 0 ]; then
        log "Removing ${OLD_COUNT} backups older than ${KEEP_DAYS} days..."
        find "${BACKUP_DIR}" -name "nomos_backup_*.tar.gz" -mtime "+${KEEP_DAYS}" -delete
    fi
fi

# ── 5. Summary ───────────────────────────────────────────────────────────────
TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -name "nomos_backup_*.tar.gz" | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)

log "═══════════════════════════════════════════"
log "Backup completed successfully!"
log "File: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
log "Size: ${BACKUP_SIZE}"
log "Total backups: ${TOTAL_BACKUPS} (${TOTAL_SIZE})"
log "Retention: ${KEEP_DAYS} days"
log "═══════════════════════════════════════════"
