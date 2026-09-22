"""Flask application factory for the Fretboard Notebook backend."""

from flask import Flask

from .api import api


def create_app() -> Flask:
    app = Flask(__name__)
    # Caddy already owns the /api prefix on the public side, but the blueprint
    # carries it too so the app behaves identically when run directly.
    app.register_blueprint(api, url_prefix="/api")
    return app
