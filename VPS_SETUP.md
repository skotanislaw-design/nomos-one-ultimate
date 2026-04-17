# Nomos One — VPS Production Setup

## Τι χρειάζεστε
- VPS: **Hetzner CX22** (€4.15/μήνα, 2 vCPU, 4GB RAM) — https://hetzner.com/cloud
- Domain: `nomos.skotanislaw.com` (ή όποιο θέλετε)
- Χρόνος: ~20 λεπτά

---

## Βήμα 1 — Αγορά VPS (Hetzner)

1. Πηγαίνετε στο https://hetzner.com/cloud → New Project
2. Server: **Ubuntu 24.04**, **CX22** (Shared vCPU, ARM64)
3. Location: **Falkenstein** (πιο κοντά στην Ελλάδα)
4. SSH Key: προσθέστε το public key σας (`~/.ssh/id_rsa.pub`)
5. Δημιουργήστε — σημειώστε την **IP address**

---

## Βήμα 2 — DNS

Στον domain registrar σας:
```
A  nomos.skotanislaw.com  →  [VPS IP]
```
Αναμονή 5-10 λεπτά για propagation.

---

## Βήμα 3 — Σύνδεση & Εγκατάσταση Docker

```bash
# Συνδεθείτε στον VPS
ssh root@[VPS-IP]

# Εγκατάσταση Docker
curl -fsSL https://get.docker.com | sh

# Εγκατάσταση Nginx + Certbot για HTTPS
apt-get install -y nginx certbot python3-certbot-nginx
```

---

## Βήμα 4 — Ανέβασμα κώδικα

**Από τον υπολογιστή σας:**
```bash
cd /Users/christosskotanis/Downloads/nomos-one-ultimate-v3

# Αντιγράψτε όλο τον φάκελο στον VPS
rsync -avz --exclude 'node_modules' --exclude '.git' \
  . root@[VPS-IP]:/opt/nomos-one/
```

---

## Βήμα 5 — Deploy στον VPS

```bash
# Συνδεθείτε στον VPS
ssh root@[VPS-IP]

cd /opt/nomos-one

# Εκτέλεση deploy
chmod +x deploy.sh && ./deploy.sh
# → Ρωτάει domain: nomos.skotanislaw.com
# → Ρωτάει κωδικό admin
# → Build + start αυτόματα
```

---

## Βήμα 6 — HTTPS με Let's Encrypt (δωρεάν)

```bash
# Nginx config για το domain
cat > /etc/nginx/sites-available/nomos << 'NGINX'
server {
    server_name nomos.skotanislaw.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/nomos /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL Certificate (δωρεάν, αυτόματη ανανέωση)
certbot --nginx -d nomos.skotanislaw.com --non-interactive --agree-tos -m christos@skotanislaw.com
```

---

## Βήμα 7 — Αυτόματο Backup (cron)

```bash
# Backup κάθε μέρα στις 3:00 πρωί
(crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/nomos-one && ./scripts/backup.sh >> /var/log/nomos-backup.log 2>&1") | crontab -
```

---

## Αποτέλεσμα

```
✅ https://nomos.skotanislaw.com   → Εφαρμογή (HTTPS)
✅ MongoDB data: /var/lib/docker/volumes/nomos-one_mongo_data
✅ Documents: /var/lib/docker/volumes/nomos-one_document_data
✅ Backup: /opt/nomos-one/backups/ (κάθε μέρα)
✅ SSL: αυτόματη ανανέωση κάθε 90 μέρες
```

---

## Χρήσιμες εντολές (στον VPS)

```bash
# Logs σε real time
docker compose logs -f

# Restart
docker compose restart

# Backup τώρα
./scripts/backup.sh

# Update εφαρμογή (μετά από αλλαγές κώδικα)
rsync -avz --exclude 'node_modules' --exclude '.git' . root@[VPS-IP]:/opt/nomos-one/
ssh root@[VPS-IP] "cd /opt/nomos-one && docker compose build --no-cache && docker compose up -d"
```

---

## SMTP Email (Gmail)

1. Google Account → Security → 2-Step Verification → App passwords
2. Δημιουργήστε App Password για "Mail"
3. Στον VPS, επεξεργαστείτε `.env`:
```bash
nano /opt/nomos-one/.env
# Συμπληρώστε:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=christos@skotanislaw.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # App Password
SMTP_FROM=christos@skotanislaw.com
```
```bash
docker compose restart backend
```

---

## Κόστος

| | |
|---|---|
| Hetzner CX22 VPS | **€4.15/μήνα** |
| Domain (.com) | ~€12/χρόνο |
| SSL (Let's Encrypt) | **Δωρεάν** |
| **Σύνολο** | **~€5/μήνα** |
