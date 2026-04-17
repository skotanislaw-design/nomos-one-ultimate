# Nomos One Client Portal - Deployment Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Frontend Deployment](#frontend-deployment)
4. [Backend Deployment](#backend-deployment)
5. [Database Setup](#database-setup)
6. [Environment Configuration](#environment-configuration)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Post-Deployment](#post-deployment)

---

## Overview

This guide provides step-by-step instructions for deploying the Nomos One legal management system with the newly implemented Client Portal feature.

### What's Included

- **Main Application**: Admin/lawyer interface for case management
- **Client Portal**: Separate login and dashboard for clients
- **Portal Admin Management**: Interface to generate access codes and manage permissions
- **Backend API**: FastAPI with MongoDB integration

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Users/Browsers                       │
├─────────────────────────────────────────────────────────┤
│  Main App (localhost:5173)  │  Portal (localhost:5173)  │
│         /login              │      /portal/login        │
│         /dashboard          │      /portal/dashboard    │
├─────────────────────────────────────────────────────────┤
│              Frontend (React + Vite)                    │
├─────────────────────────────────────────────────────────┤
│          FastAPI Backend (localhost:8000)               │
│              /api/auth                                  │
│              /api/portal                                │
│              /api/cases, /api/clients, etc.             │
├─────────────────────────────────────────────────────────┤
│         MongoDB (localhost:27017)                       │
│  - users, cases, clients, portal_access, documents     │
└─────────────────────────────────────────────────────────┘
```

---

## System Requirements

### Minimum Specifications
- **OS**: macOS, Linux, or Windows (with WSL2)
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 10GB for development, 20GB for production
- **Network**: Internet connection required for initial setup

### Software Requirements

#### Development
```bash
# Node.js and npm (for frontend)
node --version  # v18.0.0 or higher
npm --version   # v9.0.0 or higher

# Python (for backend)
python --version  # 3.11 or higher

# MongoDB (database)
mongodb --version  # 5.0 or higher

# Git (version control)
git --version  # 2.35 or higher
```

#### Production
- Docker & Docker Compose (recommended)
- Nginx or similar reverse proxy
- MongoDB (standalone or cluster)
- SSL/TLS certificates

---

## Frontend Deployment

### Development Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# Server runs at http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Output: frontend/dist/
# Static files ready for serving

# Preview production build locally
npm run preview
# Runs at http://localhost:4173
```

### Docker Deployment

```dockerfile
# Create Dockerfile.frontend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/vite.config.ts ./
COPY frontend/tsconfig.json ./
COPY frontend/index.html ./

# Build
RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/nomos-one

upstream backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name nomos.skotanislaw.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nomos.skotanislaw.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/nomos.skotanislaw.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nomos.skotanislaw.com/privkey.pem;

    # Frontend static files
    root /var/www/nomos-one/frontend/dist;

    # API proxy to backend
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA routing - all other routes to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Backend Deployment

### Development Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Production Setup with Gunicorn

```bash
# Install production server
pip install gunicorn

# Run with Gunicorn
gunicorn server:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Docker Deployment

```dockerfile
# Dockerfile.backend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY backend/ .

# Expose port
EXPOSE 8000

# Run with Gunicorn
CMD ["gunicorn", "server:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000"]
```

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: nomos-mongodb
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: ${DB_NAME}
    volumes:
      - mongo_data:/data/db
    networks:
      - nomos-network

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: nomos-backend
    ports:
      - "8000:8000"
    environment:
      MONGO_USER: ${MONGO_USER}
      MONGO_PASSWORD: ${MONGO_PASSWORD}
      DB_NAME: ${DB_NAME}
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGINS: http://localhost:3000,http://localhost:5173
      DOCUMENT_STORAGE_PATH: /app/documents
    depends_on:
      - mongodb
    volumes:
      - ./backend/documents:/app/documents
    networks:
      - nomos-network

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: nomos-frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - nomos-network

volumes:
  mongo_data:

networks:
  nomos-network:
    driver: bridge
```

---

## Database Setup

### MongoDB Installation

#### macOS with Homebrew
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

#### Linux (Ubuntu/Debian)
```bash
curl https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list
apt-get update
apt-get install -y mongodb-org
systemctl start mongod
```

#### Docker
```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:6.0
```

### Initial Database Setup

```bash
# Connect to MongoDB
mongosh -u admin -p password

# Create application database
use nomos_one

# Create collections with indexes
db.createCollection("users")
db.users.createIndex({ "email": 1 }, { unique: true })

db.createCollection("cases")
db.cases.createIndex({ "client_id": 1 })
db.cases.createIndex({ "assigned_lawyer_id": 1 })

db.createCollection("clients")
db.createCollection("documents")
db.createCollection("audit_logs")
db.createCollection("portal_access")
db.createCollection("portal_messages")
db.createCollection("portal_reset_requests")

# Create initial admin user
db.users.insertOne({
  name: "Χρήστος Σκοτάνης",
  email: "christos@skotanislaw.com",
  password_hash: "$2b$12$...", // bcrypt hash
  role: "admin",
  is_approved: true,
  created_at: new Date()
})
```

---

## Environment Configuration

### Frontend Environment Variables

Create `.env.local` in frontend directory:

```env
# API Configuration
VITE_API_URL=http://localhost:8000

# App Configuration
VITE_APP_NAME=Nomos One
VITE_APP_VERSION=3.0.0
```

### Backend Environment Variables

Create `.env` in backend directory:

```env
# Database
MONGO_USER=nomos_admin
MONGO_PASSWORD=secure_password_here
DB_NAME=nomos_one

# JWT
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars
JWT_EXPIRY_HOURS=8

# File Storage
DOCUMENT_STORAGE_PATH=/var/nomos/documents
MAX_FILE_SIZE_MB=50

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://nomos.skotanislaw.com

# Security
MIN_PASSWORD_LENGTH=8
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15

# Admin Setup
ADMIN_EMAIL=christos@skotanislaw.com
ADMIN_NAME=Χρήστος Σκοτάνης
ADMIN_INITIAL_PASSWORD=Admin123@

# Features
STAGNANT_DAYS=30
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_PORTAL=true
```

### Production Checklist

```
Security:
- [ ] Change all default passwords
- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Enable HTTPS with valid certificates
- [ ] Configure CORS for production domains
- [ ] Set up firewall rules
- [ ] Enable MongoDB authentication
- [ ] Use environment variables for secrets

Performance:
- [ ] Enable gzip compression
- [ ] Configure caching headers
- [ ] Set up CDN for static assets
- [ ] Enable database indexing
- [ ] Configure connection pooling

Monitoring:
- [ ] Set up error logging (e.g., Sentry)
- [ ] Configure uptime monitoring
- [ ] Enable database backups
- [ ] Set up log aggregation
- [ ] Create monitoring dashboards
```

---

## Testing

### Frontend Testing

```bash
cd frontend

# Install testing dependencies
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom

# Run tests
npm run test

# Test with coverage
npm run test:coverage
```

### Backend Testing

```bash
cd backend

# Install testing dependencies
pip install pytest pytest-asyncio pytest-cov

# Create tests directory
mkdir tests

# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html
```

### Portal Testing Checklist

#### Client Portal Login
```
- [ ] Test login with valid credentials
- [ ] Test login with invalid code
- [ ] Test login with wrong name
- [ ] Test forgot password form
- [ ] Test token expiration (after 30 days)
- [ ] Verify case data filtering by permissions
```

#### Client Portal Dashboard
```
- [ ] Display case information correctly
- [ ] Show lawyer contact details
- [ ] Calculate fees correctly
- [ ] Display timeline events
- [ ] Send message successfully
- [ ] Upload documents (valid & invalid files)
- [ ] Verify mobile responsiveness
```

#### Admin Portal Management
```
- [ ] Generate portal codes
- [ ] Set different permission combinations
- [ ] Copy codes to clipboard
- [ ] View access history
- [ ] Manage reset requests
- [ ] Update permissions for existing codes
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use a different port
python -m uvicorn server:app --port 8001
```

#### 2. MongoDB Connection Refused
```bash
# Check MongoDB status
mongosh --version

# Start MongoDB service
brew services start mongodb-community  # macOS
systemctl start mongod                  # Linux
docker start mongodb                    # Docker
```

#### 3. CORS Errors
```
Frontend error: "Access to XMLHttpRequest blocked by CORS policy"

Solution:
1. Check CORS_ORIGINS environment variable
2. Verify frontend URL is in allowed origins
3. Restart backend after changing CORS settings
```

#### 4. JWT Token Validation Fails
```
Error: "Μη έγκυρο token"

Solution:
1. Verify JWT_SECRET matches between frontend and backend
2. Check token expiration time
3. Clear localStorage and login again
4. Verify token format (Bearer <token>)
```

#### 5. File Upload Fails
```
Error: "Σφάλμα ανεβάσματος"

Solution:
1. Check DOCUMENT_STORAGE_PATH exists and is writable
2. Verify MAX_FILE_SIZE_MB setting
3. Check disk space availability
4. Verify file permissions on upload directory
```

### Debug Mode

```bash
# Backend debug logging
export LOG_LEVEL=DEBUG
python -m uvicorn server:app --log-level debug

# Frontend debug
npm run dev
# Open DevTools (F12) for console errors
```

---

## Post-Deployment

### Initial Setup Tasks

1. **Create Admin Account**
   ```bash
   # Use initial admin credentials from .env
   # Login at https://nomos.skotanislaw.com/login
   ```

2. **Add Lawyers**
   - Navigate to Χρήστες (Users)
   - Create lawyer accounts with role "Δικηγόρος"
   - Assign to cases

3. **Create Test Clients**
   - Add 2-3 test clients for portal testing
   - Create test cases with permission variations

4. **Generate Portal Codes**
   - Navigate to /admin-portal
   - Select test case
   - Choose permissions
   - Generate and test portal login

### Monitoring Setup

```bash
# Nginx access logs
tail -f /var/log/nginx/access.log | grep nomos.skotanislaw.com

# Backend logs
docker logs -f nomos-backend

# MongoDB logs
docker logs -f nomos-mongodb
```

### Backup Strategy

```bash
# Daily MongoDB backup
0 2 * * * mongodump --uri="mongodb://user:pass@localhost:27017/nomos_one" --out=/backups/mongo-$(date +\%Y\%m\%d)

# Document storage backup
0 3 * * * tar -czf /backups/documents-$(date +\%Y\%m\%d).tar.gz /var/nomos/documents/

# Keep last 30 days
0 4 * * * find /backups -name "mongo-*" -mtime +30 -delete
```

### Performance Optimization

```javascript
// Frontend: Enable service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Frontend: Lazy load portal routes
const ClientPortal = lazy(() => import('@/pages/ClientPortalPage'));
```

```python
# Backend: Enable database connection pooling
from motor.motor_asyncio import AsyncClient
client = AsyncClient(
    "mongodb://...",
    maxPoolSize=50,
    minPoolSize=10
)

# Backend: Cache frequently accessed data
from functools import lru_cache

@lru_cache(maxsize=128)
async def get_case_cached(case_id: str):
    return await db.cases.find_one({"_id": ObjectId(case_id)})
```

### Maintenance

```bash
# Weekly: Check disk space
df -h

# Weekly: Review error logs
grep ERROR /var/log/nomos-backend.log

# Monthly: Update dependencies
npm update
pip list --outdated

# Monthly: Review security patches
npm audit
pip check
```

---

## Support & Documentation

### Key Files
- `CHANGELOG.md` - Version history and updates
- `API_DOCUMENTATION.md` - REST API reference
- `CLIENT_PORTAL_GUIDE.md` - Client user guide
- `ADMIN_GUIDE.md` - Administrator manual

### Contact
- **Support Email**: support@skotanislaw.com
- **Issue Tracker**: GitHub Issues
- **Documentation**: Wiki

---

## Version Info

- **Nomos One**: v3.0.0
- **Portal Release Date**: April 2026
- **Last Updated**: 2026-04-17

---

*Created for Σκοτάνης & Συνεργάτες*
*Εμπιστευτική Πλατφόρμα Νομικών Λειτουργιών*
