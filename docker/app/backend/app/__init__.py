"""Flask application factory for the Fretboard Notebook backend."""

from flask import Flask, jsonify

from .api import api
from .notes import MAX_UPLOAD_BYTES, notes


def create_app() -> Flask:
    app = Flask(__name__)
    # The one route with a body is the note upload, so the app's own ceiling is
    # that route's. Set here rather than checked in the route because this is
    # what makes werkzeug refuse an oversized body before reading it into
    # memory — a check inside the handler would already be too late.
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    @app.errorhandler(413)
    def too_large(_error):
        """JSON, like every other answer under /api. Werkzeug raises this
        before the route is reached, so its own HTML page is what a caller
        would otherwise get from an API that speaks nothing but JSON."""
        return jsonify(error="that sheet is too large to publish"), 413

    # Caddy already owns the /api prefix on the public side, but the blueprints
    # carry it too so the app behaves identically when run directly.
    app.register_blueprint(api, url_prefix="/api")
    # The published notes: read out of the private R2 bucket over the S3 API,
    # and written back to it when a sheet is published from the editor.
    app.register_blueprint(notes, url_prefix="/api")
    return app
