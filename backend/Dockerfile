FROM python:3.11-slim

WORKDIR /app

# Security: don't run as root
RUN addgroup --system appgroup && adduser --system --group appuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    # Playwright Chromium dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libxkbcommon0 libx11-6 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libatspi2.0-0 libxshmfence1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium in a shared path accessible by all users
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN python -m playwright install chromium && \
    python -m playwright install-deps chromium 2>/dev/null || true && \
    chmod -R 755 /opt/playwright-browsers

COPY . .

# Create data directory with proper permissions
RUN mkdir -p /data/documents && chown -R appuser:appgroup /data /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
