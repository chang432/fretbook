"""API routes.

Currently only a health probe plus a version endpoint — the app itself is
static, so this is the seam to hang real endpoints off as they arrive.
"""

from flask import Blueprint, jsonify

api = Blueprint("api", __name__)

VERSION = "0.1.0"


@api.get("/health")
def health():
    """Liveness probe used by the container healthcheck."""
    return jsonify(status="ok"), 200


@api.get("/version")
def version():
    return jsonify(version=VERSION), 200
