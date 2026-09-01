FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# The account DB is rebuilt from X_SCRAPE_COOKIES on every boot (see accounts.py),
# so it lives in /tmp by default and needs no persistent disk. Set TWS_DB to a
# mounted volume path if the host provides one.
RUN useradd -m app && mkdir -p /tmp/x-scrape && chown -R app /app /tmp/x-scrape
USER app

EXPOSE 8080
# $PORT is set by most PaaS hosts (Render, Railway); fall back to 8080 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
