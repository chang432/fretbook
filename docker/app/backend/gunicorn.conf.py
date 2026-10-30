"""Gunicorn settings. Overridable from the environment so the same image can be
tuned per deployment without a rebuild."""

import io
import os
import sys

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
threads = int(os.getenv("GUNICORN_THREADS", "4"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "30"))

#: A file inside the container that every print and every gunicorn log line is
#: *also* written to. Empty turns the file off and leaves the streams alone.
LOG_FILE = os.getenv("LOG_FILE", "/var/log/output.log")


class _Tee(io.TextIOBase):
    """One stream written to two places: the real stdout/stderr, and the log
    file. A plain redirect would take the output off the container's streams
    and empty `docker compose logs`, which is where `npm run stack:logs` and
    deploy-local.sh read from — so both ends get every line."""

    def __init__(self, stream, mirror):
        self._stream = stream
        self._mirror = mirror

    def write(self, text):
        try:
            self._mirror.write(text)
        except ValueError:
            # The file went away under us (closed, unlinked). The container's
            # own streams are the ones that matter; never lose a line over it.
            pass
        return self._stream.write(text)

    def flush(self):
        try:
            self._mirror.flush()
        except ValueError:
            pass
        self._stream.flush()

    def writable(self):
        return True

    def isatty(self):
        return self._stream.isatty()

    def fileno(self):
        # The real stream's descriptor: anything reaching for an fd wants the
        # one the OS knows about, not the mirror's.
        return self._stream.fileno()

    @property
    def encoding(self):
        return self._stream.encoding


def _install_tee(path: str) -> None:
    """Point sys.stdout/sys.stderr at the file as well as at the container's
    streams. Done here at module level — the arbiter reads this config before
    it builds its log handlers and before it forks, so the workers and
    gunicorn's own logger inherit the tees without anything else opting in."""
    try:
        # Line buffered, so a forked worker cannot carry a half-written line
        # of the parent's in its copy of the buffer.
        mirror = open(path, "a", buffering=1, encoding="utf-8")
    except OSError as exc:
        # An unwritable path is not worth failing to boot over: say so once on
        # stderr and carry on logging to the streams alone.
        print(f"gunicorn: cannot log to {path}: {exc}", file=sys.stderr)
        return
    sys.stdout = _Tee(sys.stdout, mirror)
    sys.stderr = _Tee(sys.stderr, mirror)


if LOG_FILE:
    _install_tee(LOG_FILE)

# Logs to stdout/stderr so `docker compose logs` is the single place to look —
# and, through the tee above, to LOG_FILE inside the container as well.
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
