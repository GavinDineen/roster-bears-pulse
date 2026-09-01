FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TWS_DB=/data/accounts.db

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# twscrape's SQLite account DB lives on a mounted volume (see fly.toml).
RUN mkdir -p /data && useradd -m app && chown -R app /app /data
USER app

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
