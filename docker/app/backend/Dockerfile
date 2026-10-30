FROM python:3.12-slim

# Unbuffered output keeps gunicorn logs flowing to `docker compose logs`.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY gunicorn.conf.py wsgi.py ./
COPY app ./app

# Run unprivileged. The log file every print is mirrored into (see
# gunicorn.conf.py) is created here rather than at boot: /var/log belongs to
# root, so the process could not make it for itself.
RUN useradd --create-home --uid 10001 appuser \
 && touch /var/log/output.log \
 && chown appuser:appuser /var/log/output.log
USER appuser

EXPOSE 8000
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
