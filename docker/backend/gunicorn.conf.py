"""Gunicorn settings. Overridable from the environment so the same image can be
tuned per deployment without a rebuild."""

import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
threads = int(os.getenv("GUNICORN_THREADS", "4"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "30"))

# Logs to stdout/stderr so `docker compose logs` is the single place to look.
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
