#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Nomos One — Deploy Script
# Τρέξτε: chmod +x deploy.sh && ./deploy.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      Nomos One — Legal Office Platform          ║${NC}"
echo -e "${BOLD}║      Σκοτάνης & Συνεργάτες                     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Docker check ──────────────────────────────────────────────────────────
command -v docker &>/dev/null || err "Docker δεν βρέθηκε. Εγκατάσταση: https://docs.docker.com/get-docker/"
DC=$(docker compose version &>/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
log "Docker: $(docker --version | grep -oP '[\d.]+'  | head -1)"

# ── 2. Generate .env ─────────────────────────────────────────────────────────
if [ -f .env ]; then
    warn ".env υπάρχει ήδη."
    read -p "   Επανεκκίνηση χωρίς αλλαγές; (yes/no): " KEEP
    [ "${KEEP}" = "yes" ] && goto_start=1 || rm .env
fi

if [ ! -f .env ]; then
    info "Δημιουργία .env..."
    JWT_SECRET=$(openssl rand -hex 32)
    MONGO_PW=$(openssl rand -base64 18 | tr -d '/+=')

    echo ""
    echo -e "${CYAN}Ρύθμιση κωδικού διαχειριστή:${NC}"
    while true; do
        read -sp "  Κωδικός (8+ χαρακτήρες): " ADMIN_PW; echo ""
        [ ${#ADMIN_PW} -lt 8 ] && { warn "Πολύ σύντομος"; continue; }
        read -sp "  Επιβεβαίωση: " ADMIN_PW2; echo ""
        [ "${ADMIN_PW}" = "${ADMIN_PW2}" ] && break || warn "Δεν ταιριάζουν"
    done

    echo ""
    read -p "  Domain (π.χ. nomos.skotanislaw.com ή αφήστε κενό για localhost): " DOMAIN
    DOMAIN="${DOMAIN:-localhost}"
    if [ "$DOMAIN" = "localhost" ]; then
        CORS="http://localhost:3000,http://localhost:5173"
        API_URL="http://localhost:8000"
    else
        CORS="https://${DOMAIN}"
        API_URL="https://${DOMAIN}"
    fi

    cat > .env << ENVEOF
# Nomos One — $(date '+%Y-%m-%d')
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY_HOURS=8
MONGO_USER=nomos_admin
MONGO_PASSWORD=${MONGO_PW}
DB_NAME=nomos_one
ADMIN_EMAIL=christos@skotanislaw.com
ADMIN_NAME=Χρήστος Σκοτάνης
ADMIN_INITIAL_PASSWORD=${ADMIN_PW}
DOCUMENT_STORAGE_PATH=/data/documents
MAX_FILE_SIZE_MB=50
STAGNANT_DAYS=30
MIN_PASSWORD_LENGTH=8
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
CORS_ORIGINS=${CORS}
VITE_API_URL=${API_URL}
# SMTP — συμπληρώστε για πραγματική αποστολή email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=Σκοτάνης & Συνεργάτες
ENVEOF
    log ".env δημιουργήθηκε"
fi

# ── 3. Build & Start ─────────────────────────────────────────────────────────
echo ""
info "Build containers (2-5 λεπτά)..."
${DC} build --no-cache

info "Εκκίνηση..."
${DC} up -d

# ── 4. Health check ──────────────────────────────────────────────────────────
info "Αναμονή εκκίνησης backend..."
for i in $(seq 1 30); do
    curl -sf http://localhost:8000/api/health &>/dev/null && { log "Backend ενεργό!"; break; }
    sleep 2; printf "."
done; echo ""
curl -sf http://localhost:8000/api/health &>/dev/null || warn "Backend αργεί — τρέξτε: ${DC} logs backend"

# ── 5. Remove initial password from .env ────────────────────────────────────
sed -i.bak '/^ADMIN_INITIAL_PASSWORD=/d' .env 2>/dev/null && rm -f .env.bak
log "Αρχικός κωδικός αφαιρέθηκε από .env"

# ── 6. Summary ───────────────────────────────────────────────────────────────
DOMAIN_VAL=$(grep VITE_API_URL .env | cut -d= -f2 | sed 's|https\?://||')
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║        Εγκατάσταση Ολοκληρώθηκε! ✓           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Εφαρμογή:${NC}  http://${DOMAIN_VAL}:3000"
echo -e "  ${BOLD}API Docs:${NC}  http://localhost:8000/docs"
echo ""
echo -e "  ${BOLD}Login:${NC}"
echo -e "    📧  christos@skotanislaw.com"
echo -e "    🔑  ο κωδικός που δώσατε"
echo ""
echo -e "  ${BOLD}Εντολές:${NC}"
echo -e "    ${DC} logs -f          # Live logs"
echo -e "    ${DC} restart          # Επανεκκίνηση"
echo -e "    ${DC} down             # Τερματισμός"
echo -e "    ./scripts/backup.sh   # Backup τώρα"
echo ""
echo -e "  ${YELLOW}💡 Για HTTPS: διαβάστε το VPS_SETUP.md${NC}"
echo ""
