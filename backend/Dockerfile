FROM python:3.11-slim

WORKDIR /app

# Security: don't run as root
RUN addgroup --system appgroup && adduser --system --group appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Create data directory with proper permissions
RUN mkdir -p /data/documents && chown -R appuser:appgroup /data /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
