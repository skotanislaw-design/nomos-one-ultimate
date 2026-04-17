#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Nomos One — Restore Script
# Restores from a backup created by backup.sh
#
# Usage:
#   ./scripts/restore.sh backups/nomos_backup_20260322_030000.tar.gz
#
# WARNING: This will OVERWRITE the current database and documents!
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[RESTORE]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }

# ── Validate args ─────────────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
    err "Usage: ./scripts/restore.sh <backup_file.tar.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
    err "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# ── Config ────────────────────────────────────────────────────────────────────
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MONGO_USER="${MONGO_USER:-nomos_admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
DB_NAME="${DB_NAME:-nomos_one}"
DOCUMENT_VOLUME="nomos-one-fixed_document_data"

# ── Confirmation ──────────────────────────────────────────────────────────────
echo ""
echo -e "${RED}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ΠΡΟΣΟΧΗ: Αυτή η ενέργεια θα αντικαταστήσει      ║${NC}"
echo -e "${RED}║  τη βάση δεδομένων και τα αρχεία εγγράφων!       ║${NC}"
echo -e "${RED}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Backup file: ${BACKUP_FILE}"
echo "Database: ${DB_NAME}"
echo ""
read -p "Θέλετε να συνεχίσετε; (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    log "Ακύρωση."
    exit 0
fi

# ── Extract ───────────────────────────────────────────────────────────────────
TEMP_DIR=$(mktemp -d)
log "Extracting backup to ${TEMP_DIR}..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted directory
BACKUP_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name "nomos_backup_*" | head -1)
if [ -z "${BACKUP_DIR}" ]; then
    err "Invalid backup format"
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# ── 1. Restore MongoDB ──────────────────────────────────────────────────────
if [ -d "${BACKUP_DIR}/db" ]; then
    log "Restoring MongoDB database..."

    if docker ps | grep -q nomos_mongo; then
        docker cp "${BACKUP_DIR}/db" nomos_mongo:/tmp/mongorestore_data

        if [ -n "${MONGO_PASSWORD}" ]; then
            docker exec nomos_mongo mongorestore \
                --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
                --drop \
                --quiet \
                /tmp/mongorestore_data 2>/dev/null
        else
            docker exec nomos_mongo mongorestore \
                --db="${DB_NAME}" \
                --drop \
                --quiet \
                /tmp/mongorestore_data 2>/dev/null
        fi
        docker exec nomos_mongo rm -rf /tmp/mongorestore_data
    else
        if command -v mongorestore &> /dev/null; then
            if [ -n "${MONGO_PASSWORD}" ]; then
                mongorestore \
                    --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
                    --drop --quiet "${BACKUP_DIR}/db"
            else
                mongorestore --db="${DB_NAME}" --drop --quiet "${BACKUP_DIR}/db"
            fi
        else
            err "mongorestore not found"
            rm -rf "${TEMP_DIR}"
            exit 1
        fi
    fi
    log "MongoDB restore completed"
else
    warn "No database dump found in backup"
fi

# ── 2. Restore Document Files ────────────────────────────────────────────────
if [ -d "${BACKUP_DIR}/documents" ]; then
    log "Restoring document files..."

    if docker volume ls | grep -q "${DOCUMENT_VOLUME}"; then
        docker run --rm \
            -v "${DOCUMENT_VOLUME}:/dest" \
            -v "$(realpath ${BACKUP_DIR}/documents):/source:ro" \
            alpine sh -c "rm -rf /dest/* && cp -r /source/* /dest/" 2>/dev/null || {
            warn "Could not restore to Docker volume"
        }
    elif [ -d "/data/documents" ]; then
        rm -rf /data/documents/*
        cp -r "${BACKUP_DIR}/documents/"* /data/documents/
    else
        warn "Document storage path not found"
    fi
    log "Document files restore completed"
else
    warn "No document files found in backup"
fi

# ── Cleanup ──────────────────────────────────────────────────────────────────
rm -rf "${TEMP_DIR}"

log "═══════════════════════════════════════════"
log "Restore completed successfully!"
log "Recommend restarting the application:"
log "  docker-compose restart backend"
log "═══════════════════════════════════════════"
