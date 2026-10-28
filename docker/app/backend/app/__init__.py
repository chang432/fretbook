"""Flask application factory for the Fretboard Notebook backend."""

from flask import Flask

from .api import api
from .notes import notes


def create_app() -> Flask:
    app = Flask(__name__)
    # Caddy already owns the /api prefix on the public side, but the blueprints
    # carry it too so the app behaves identically when run directly.
    app.register_blueprint(api, url_prefix="/api")
    # The published notes, read out of the private R2 bucket over the S3 API.
    app.register_blueprint(notes, url_prefix="/api")
    return app
