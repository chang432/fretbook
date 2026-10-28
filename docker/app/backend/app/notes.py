"""The published notes, read out of R2 over the S3 API.

The bucket is private: nothing but this process can read it, and the browser
reaches a note by asking its own origin for /api/notes/<slug>. A browser cannot
sign an S3 request — signing needs the R2 token, and anything in the bundle is
readable by anyone who opens devtools — so this is the hop that lets the bucket
stop being public. See docs/notes-via-s3-client.md.

The keys are the ones scripts/notes.mjs writes, unchanged:

    notes.json            the manifest /notes lists
    notes/<name>.json     one note, the editor's own JSON export

The manifest is read as an object rather than rebuilt by listing the bucket,
which is what lets the token this holds be **GetObject and nothing else** — no
list, no write, no delete. Publishing still happens from a laptop with a
read-write token; this end of it only ever reads.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, Response, jsonify

notes = Blueprint("notes", __name__)

# The same shape the publisher enforces (NOTE_NAME in src/utils/tab.js). A slug
# is user input on its way into a key, so it is checked against the pattern that
# already defines a legal note name rather than merely scrubbed of "..".
NOTE_NAME = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")

#: Notes sit under a prefix and the manifest does not, so no note is barred
#: from being called "notes".
PREFIX = "notes"
MANIFEST = "notes.json"

#: How long an object is reused before R2 is asked again. The same window
#: notes:publish puts on a note, which is the trade this cache makes: a publish
#: appears within a minute instead of instantly, and /notes costs one GetObject
#: a minute instead of one per page view.
TTL_SECONDS = 60

_lock = threading.Lock()
_client = None
_cache: dict[str, tuple[float, bytes | None]] = {}


def _bucket() -> str:
    return os.environ.get("FRETBOOK_NOTES_BUCKET", "").strip()


def _endpoint() -> str:
    return os.environ.get("FRETBOOK_R2_ENDPOINT", "").strip()


def _s3():
    """The S3 client, built once. Credentials are boto3's own to find."""
    global _client
    with _lock:
        if _client is None:
            _client = boto3.client(
                "s3",
                endpoint_url=_endpoint(),
                # R2 ignores the region but the signature does not: it has to be
                # signed for something, and "auto" is what R2 documents.
                region_name="auto",
                config=Config(
                    signature_version="s3v4",
                    retries={"max_attempts": 2, "mode": "standard"},
                    connect_timeout=3,
                    read_timeout=10,
                ),
            )
        return _client


def _fetch(key: str) -> bytes | None:
    """One object's body, or None if there is nothing readable at that key."""
    try:
        return _s3().get_object(Bucket=_bucket(), Key=key)["Body"].read()
    except ClientError:
        # NoSuchKey is the ordinary case and reads as a 404 upstream. Anything
        # else — a denied token, a bucket that is not there — is also "no note
        # to serve", and saying which would be telling a stranger about the
        # bucket's configuration.
        return None
    except BotoCoreError:
        # Endpoint unreachable, credentials unresolvable, a timeout.
        return None


def _object(key: str) -> bytes | None:
    """`_fetch` behind the TTL cache. A miss is cached too, briefly, so a
    hammered missing slug does not become a GetObject per request."""
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    body = _fetch(key)

    with _lock:
        _cache[key] = (now + TTL_SECONDS, body)
    return body


def _unconfigured():
    """503 while the bucket or the endpoint is missing, which is a deployment
    that has not been given its environment rather than a missing note."""
    if _bucket() and _endpoint():
        return None
    return jsonify(error="the notes bucket is not configured"), 503


def _json(body: bytes, cache_control: str):
    """An object's bytes, served as they sit in the bucket. Passing the body
    through rather than re-encoding it keeps this end from having an opinion
    about a note's contents."""
    return Response(
        body,
        mimetype="application/json",
        headers={"Cache-Control": cache_control},
    )


@notes.get("/notes")
def index():
    """The manifest, as `[{ slug, title }]`.

    no-store for the browser although the backend holds it for a minute: the
    page should always ask, so that a publish shows up as soon as the cache
    behind this lets it, rather than a minute after that.
    """
    if unconfigured := _unconfigured():
        return unconfigured

    body = _object(MANIFEST)
    if body is None:
        # Nothing published yet is an empty shelf, not an error: the index page
        # says nothing is published, which is what a reader needs to know.
        return _json(b"[]", "no-store")

    try:
        listed = json.loads(body)
    except ValueError:
        return _json(b"[]", "no-store")

    if not isinstance(listed, list):
        return _json(b"[]", "no-store")

    return _json(body, "no-store")


@notes.get("/notes/<slug>")
def note(slug: str):
    """One note — the editor's own JSON export, byte for byte."""
    if unconfigured := _unconfigured():
        return unconfigured

    if not NOTE_NAME.match(slug):
        return jsonify(error="not a note name"), 404

    body = _object(f"{PREFIX}/{slug}.json")
    if body is None:
        return jsonify(error="no such note"), 404

    try:
        json.loads(body)
    except ValueError:
        # Valid JSON is as far as this end can judge: whether the object is an
        # export the editor can open is fromJson's call, in the browser, as it
        # was when the browser read the bucket directly.
        return jsonify(error="no such note"), 404

    return _json(body, "public, max-age=60")
