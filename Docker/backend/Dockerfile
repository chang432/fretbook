FROM python:3.12-slim

# Unbuffered output keeps gunicorn logs flowing to `docker compose logs`.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY gunicorn.conf.py wsgi.py ./
COPY app ./app

# Run unprivileged.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
