"""The published notes: read out of R2 over the S3 API, and written back to it.

The bucket is private: nothing but this process can reach it, and the browser
reaches a note by asking its own origin for /api/notes/<slug>. A browser cannot
sign an S3 request — signing needs the R2 token, and anything in the bundle is
readable by anyone who opens devtools — so this is the hop that lets the bucket
stop being public. See docs/notes-via-s3-client.md.

The keys are the ones scripts/notes.mjs writes, unchanged:

    notes.json            the manifest /notes lists
    notes/<name>.json     one note, the editor's own JSON export

    GET    /api/notes          the manifest
    GET    /api/notes/<slug>   one note
    PUT    /api/notes/<slug>   publish the sheet in the body under that name
    POST   /api/notes/<slug>   replace that note — password required
    DELETE /api/notes/<slug>   take that note down — password required

The manifest is read and rewritten as an object rather than rebuilt by listing
the bucket, so the token this holds needs GetObject, PutObject and DeleteObject
and still no list — `notes:manifest` stays the thing that rebuilds it from what
is actually there, and remains the repair tool when two writes land at once and
one read-modify-write of the manifest loses the other's line.

**PUT is open: anyone who can open the site can publish.** What keeps that from
being a bucket anyone can rewrite is that a name is claimed once — an upload
onto a name that already exists is refused rather than overwriting it, which
matters because R2 keeps no versions, so a write over a note is final and there
is no second copy anywhere (docs/notes-pull-from-r2.md). Deleting and replacing
are still a laptop with the same token and scripts/notes.mjs. The other guards
are a body limit, an envelope check so a reader never meets a note the editor
cannot open, and a cap on how fast uploads are accepted; see
docs/notes-upload-from-app.md for what they are and are not worth.

**POST and DELETE are not open.** They are the two routes that destroy
something — one writes over a note that is already there, the other takes it
down, and R2 keeps no versions either way — so both carry a password, in a
header, compared against FRETBOOK_PUBLISH_PASSWORD. Without that variable they
answer 503 rather than letting an empty password through, and wrong guesses are
capped separately from uploads. The three are kept apart rather than made one
route in three moods: PUT can only add a note, POST can only replace one and
DELETE can only remove one, so none can quietly do another's job.
"""

from __future__ import annotations

import hmac
import json
import os
import re
import threading
import time
from collections import deque

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, Response, jsonify, request

notes = Blueprint("notes", __name__)

# The same shape the publisher enforces (NOTE_NAME in src/utils/tab.js). A slug
# is user input on its way into a key, so it is checked against the pattern that
# already defines a legal note name rather than merely scrubbed of "..".
NOTE_NAME = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")

#: Notes sit under a prefix and the manifest does not, so no note is barred
#: from being called "notes".
PREFIX = "notes"
MANIFEST = "notes.json"

#: The sheet format an upload has to be in, mirroring `SHEET_FORMAT` and
#: `SHEET_VERSION` in src/utils/tab.js the way NOTE_NAME above mirrors its
#: pattern. Only the envelope is checked here — whether the thing inside it is
#: a sheet the editor can open is still `fromJson`'s call, in the browser — but
#: the envelope is what tells a current export from an old one or from a file
#: that was never one, and a reader meeting either is the failure worth
#: spending ten lines to avoid. A bumped version refuses uploads until this
#: constant is bumped with it.
SHEET_FORMAT = "fretboard-notebook"
SHEET_VERSION = 13

#: The largest upload accepted. A note is a few KB and a long sheet tens, so
#: this is wide enough for anything the editor produces and narrow enough that
#: the bucket cannot be filled a megabyte at a time. app/__init__.py sets the
#: same figure as Flask's own MAX_CONTENT_LENGTH, which is what stops a body
#: being read into memory before this can judge its length.
MAX_UPLOAD_BYTES = 512 * 1024

#: How much of a title is kept in the manifest. The note itself is stored
#: byte for byte whatever this says; only the line /notes lists is clipped,
#: so one upload cannot make the index unreadable for everyone else.
MAX_TITLE_CHARS = 120

#: The header a password arrives in. A header rather than the query string or
#: the body: a URL is logged by every hop that sees it, and the body is the
#: sheet.
PASSWORD_HEADER = "X-Fretbook-Password"

#: How many wrong passwords this worker entertains in a minute. Counted apart
#: from uploads, and checked before the comparison, since a cap that only
#: applies after a guess has been tested does not cap guessing at all. The cost
#: is that a minute of guessing locks the owner out for the rest of that
#: minute, which is the cheaper half of the trade.
WRONG_PASSWORDS_PER_MINUTE = 5

#: How many uploads this worker accepts in a minute, all callers together.
#: Not a defence — it is one process of several and says nothing about who is
#: asking — but it is the difference between a loop adding a few notes and a
#: loop adding a hundred thousand, and it costs one deque. The real control, if
#: it is ever wanted, is a passphrase or Cloudflare's own rate limiting.
UPLOADS_PER_MINUTE = 20

#: How long an object is reused before R2 is asked again. The same window
#: notes:publish puts on a note, which is the trade this cache makes: a publish
#: appears within a minute instead of instantly, and /notes costs one GetObject
#: a minute instead of one per page view.
TTL_SECONDS = 60

_lock = threading.Lock()
_client = None
_cache: dict[str, tuple[float, bytes | None]] = {}

#: When the uploads this worker has accepted were accepted, oldest first, kept
#: only as far back as the window above, and the same for wrong passwords.
_accepted: deque[float] = deque()
_wrong: deque[float] = deque()


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


# --- Publishing -------------------------------------------------------------
#
# The write end of the same bucket. Everything above answers a reader; what
# follows accepts a sheet from the editor and makes it one more published note,
# which is the one thing here that cannot be taken back by trying again.


def _exists(key: str) -> bool | None:
    """Whether something sits at that key — True, False, or None when R2 could
    not be asked.

    Asked straight rather than through the TTL cache: whether a note is there
    is the one question a minute-old answer must not be given to, since it
    decides whether somebody's note is written over or taken down.
    """
    try:
        _s3().head_object(Bucket=_bucket(), Key=key)
        return True
    except ClientError as error:
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        # 404 is nothing being there. Anything else — a denied token, a
        # bucket that is not there — is not evidence either way, so it is
        # neither.
        return False if status == 404 else None
    except BotoCoreError:
        return None


def _put(key: str, body: bytes, cache_control: str) -> bool:
    """One object written, with the headers scripts/notes.mjs gives it."""
    try:
        _s3().put_object(
            Bucket=_bucket(),
            Key=key,
            Body=body,
            ContentType="application/json",
            CacheControl=cache_control,
        )
    except (BotoCoreError, ClientError):
        return False

    # The bytes just written are what the bucket now holds, so the cached copy
    # of this key is known to be stale rather than merely old. Dropping it is
    # what makes a publish from the app appear at once instead of within the
    # minute the cache would otherwise hold.
    with _lock:
        _cache.pop(key, None)
    return True


def _full(window: deque[float], per_minute: int) -> bool:
    """Whether a per-minute window has no room left, dropping what has aged
    out of it on the way. Nothing is counted in: asking and recording are kept
    apart because the password check has to ask before it knows whether there
    is anything to record."""
    now = time.monotonic()
    with _lock:
        while window and window[0] <= now - 60:
            window.popleft()
        return len(window) >= per_minute


def _count(window: deque[float]):
    """Record one event in a window."""
    with _lock:
        window.append(time.monotonic())


def _delete(key: str) -> bool:
    """One object removed.

    R2 keeps no versions and nothing else holds a copy, so this is as final as
    a write over one. S3 treats deleting what is not there as success, which is
    why the routes check first rather than reading the answer back out of this.
    """
    try:
        _s3().delete_object(Bucket=_bucket(), Key=key)
    except (BotoCoreError, ClientError):
        return False

    # Nothing is there now, which the cached copy of this key does not know.
    with _lock:
        _cache.pop(key, None)
    return True


def _within(window: deque[float], per_minute: int) -> bool:
    """Count one event against a window, or refuse it."""
    if _full(window, per_minute):
        return False
    _count(window)
    return True


def _manifest_entries() -> list[dict]:
    """The manifest as a list of entries, dropping anything that is not one.

    Read straight rather than through the cache, for the same reason as
    `_exists`: this copy is about to be written back, and rewriting a minute-old
    one would drop whatever was published in between.
    """
    body = _fetch(MANIFEST)
    if body is None:
        # No manifest yet is an empty bucket, and the upload about to be added
        # is the first line of its first one.
        return []

    try:
        listed = json.loads(body)
    except ValueError:
        # Unreadable is treated as absent, which is the same judgement the
        # index route makes. `notes:manifest` rebuilds it from the bucket.
        return []

    if not isinstance(listed, list):
        return []
    return [entry for entry in listed if isinstance(entry, dict) and entry.get("slug")]


def _save_manifest(entries: list[dict]) -> bool:
    """Write the manifest, in the order /notes lists it."""
    # Title then slug, the order scripts/notes.mjs sorts into, so a manifest
    # this writes and one that command rebuilds list the same notes the same
    # way round.
    entries.sort(key=lambda entry: (str(entry.get("title") or ""), str(entry.get("slug"))))

    body = f"{json.dumps(entries, indent=2, ensure_ascii=False)}\n".encode()
    # no-cache, unlike a note: this is the object that has to reflect a write
    # immediately.
    return _put(MANIFEST, body, "no-cache")


def _without(slug: str) -> list[dict]:
    """The manifest's entries, minus that note's."""
    return [entry for entry in _manifest_entries() if entry.get("slug") != slug]


def _list_note(slug: str, title: str) -> bool:
    """Add one note to the manifest, replacing the line it already has."""
    return _save_manifest([*_without(slug), {"slug": slug, "title": title}])


def _unlist_note(slug: str) -> bool:
    """Take one note out of the manifest."""
    return _save_manifest(_without(slug))


def _sheet_title(data) -> str | None:
    """The title to list an uploaded sheet under, or None if the body is not a
    current export at all.

    Only the envelope is judged — see SHEET_VERSION above for why that line is
    drawn here and the rest of it in the browser.
    """
    if not isinstance(data, dict):
        return None
    if data.get("format") != SHEET_FORMAT or data.get("version") != SHEET_VERSION:
        return None

    title = data.get("title")
    if not isinstance(title, str):
        return None

    # The two the editor always writes and a reader cannot do without. Their
    # contents are fromJson's business; that they are there at all is what
    # separates an export from a JSON file that happens to carry the envelope.
    if not isinstance(data.get("columns"), list) or not data["columns"]:
        return None
    if not isinstance(data.get("rows"), list) or not data["rows"]:
        return None

    if not isinstance(data.get("structure"), list) or not isinstance(data.get("arrangement"), list):
        return None

    # Untitled sheets are listed under their name, the way notes.mjs lists one.
    return title.strip()[:MAX_TITLE_CHARS]


def _submitted_sheet():
    """The sheet in the request body and the title to list it under, or an
    answer to send back in their place.

    Both write routes judge a body the same way; what differs is who is
    allowed to send one and what is done with it afterwards.
    """
    body = request.get_data(cache=False)
    # Flask has already refused anything over its own limit by now; this covers
    # a body that arrives chunked, with no length to refuse it on.
    if len(body) > MAX_UPLOAD_BYTES:
        return None, None, (jsonify(error="that sheet is too large to publish"), 413)

    try:
        data = json.loads(body)
    except ValueError:
        return None, None, (jsonify(error="that is not a Fretboard Notebook export"), 400)

    title = _sheet_title(data)
    if title is None:
        return None, None, (
            jsonify(error="that is not a current Fretboard Notebook export"),
            400,
        )

    return body, title, None


def _password() -> str:
    """The password the update route asks for. Empty means the route is off."""
    return os.environ.get("FRETBOOK_PUBLISH_PASSWORD", "").strip()


def _wrong_password():
    """Everything the update route refuses on, before it looks at the body.

    None means the caller may go on. Checking the window before the comparison
    is what caps guessing; comparing first would test every guess that was
    sent, whatever the window said.
    """
    password = _password()
    if not password:
        # No password set is the route being off, not a password of "". Said
        # as plainly as the missing-bucket 503 beside it: this is a deployment
        # that has not been given its environment.
        return jsonify(error="updating a note is not set up on this site"), 503

    if _full(_wrong, WRONG_PASSWORDS_PER_MINUTE):
        return jsonify(error="too many wrong passwords just now — try again shortly"), 429

    # compare_digest rather than ==, so the answer does not arrive sooner for a
    # password that was wrong in its first character than in its last.
    if hmac.compare_digest(request.headers.get(PASSWORD_HEADER, ""), password):
        return None

    # Only the wrong ones are counted, so the cap is on guessing rather than on
    # updating, and the owner's own presses never crowd the window.
    _count(_wrong)
    return jsonify(error="that password is not right"), 401


@notes.put("/notes/<slug>")
def publish(slug: str):
    """Publish the sheet in the body as /notes/<slug>.

    201 and the note is live — the manifest is rewritten in the same call, so
    /notes lists it on the next visit. 409 means the name is taken, which is
    the whole of the protection a bucket with no versioning gets: a published
    note cannot be replaced or removed through this route, only alongside an
    unused name.
    """
    if unconfigured := _unconfigured():
        return unconfigured

    if not NOTE_NAME.match(slug):
        return jsonify(error="not a note name"), 400

    body, title, refused = _submitted_sheet()
    if refused:
        return refused

    # Counted after the body is judged and before anything is written, so a
    # stream of junk cannot use up the window that real uploads share.
    if not _within(_accepted, UPLOADS_PER_MINUTE):
        return jsonify(error="too many notes published just now — try again shortly"), 429

    key = f"{PREFIX}/{slug}.json"
    taken = _exists(key)
    if taken is None:
        return jsonify(error="the notes bucket cannot be reached"), 503
    if taken:
        return jsonify(error="that name is taken"), 409

    # Stored as it arrived rather than re-encoded, so what a reader is served
    # is byte for byte the export the editor made — the same thing
    # notes:publish uploads, and what lets the ETag be the file's own MD5.
    #
    # Short rather than immutable, matching notes:publish: a note can still be
    # republished over by hand, and a minute of staleness is cheaper than never
    # caching at all.
    if not _put(key, body, "public, max-age=60"):
        return jsonify(error="the note could not be published"), 503

    # The note is live either way: it is readable at its own URL the moment the
    # object lands. A manifest that did not get written leaves it unlisted
    # until `notes:manifest` runs, which is worth saying rather than reporting
    # as a failed publish and inviting a second upload of the same sheet.
    listed = _list_note(slug, title or slug)

    return jsonify(slug=slug, title=title, path=f"/notes/{slug}", listed=listed), 201


@notes.post("/notes/<slug>")
def update(slug: str):
    """Replace the note at /notes/<slug> with the sheet in the body.

    The one route here that can destroy something. R2 keeps no versions and
    nothing else holds a copy, so what this writes over is gone — which is why
    it is the one route with a password on it, and why it is separate from the
    PUT beside it rather than the same route in a second mood.

    200 and the note is replaced, the manifest carrying its title again in case
    that changed too. 404 if there is no note there: adding one is PUT's job,
    and a typo in a name should not quietly publish a second copy.
    """
    if unconfigured := _unconfigured():
        return unconfigured

    if not NOTE_NAME.match(slug):
        return jsonify(error="not a note name"), 400

    # Before the body is read, let alone judged: an unauthorised caller gets
    # the same answer whatever they sent, and sends nothing worth parsing.
    if refused := _wrong_password():
        return refused

    body, title, refused = _submitted_sheet()
    if refused:
        return refused

    if not _within(_accepted, UPLOADS_PER_MINUTE):
        return jsonify(error="too many notes published just now — try again shortly"), 429

    key = f"{PREFIX}/{slug}.json"
    there = _exists(key)
    if there is None:
        return jsonify(error="the notes bucket cannot be reached"), 503
    if not there:
        return jsonify(error="no such note"), 404

    if not _put(key, body, "public, max-age=60"):
        return jsonify(error="the note could not be updated"), 503

    # Rewritten rather than left alone: the title is the one thing the manifest
    # holds, and an update is how it changes. `_list_note` replaces the line
    # this slug already has.
    listed = _list_note(slug, title or slug)

    return jsonify(slug=slug, title=title, path=f"/notes/{slug}", listed=listed), 200



@notes.delete("/notes/<slug>")
def unpublish(slug: str):
    """Take the note at /notes/<slug> down.

    The same password as POST, for the same reason: R2 keeps no versions, the
    repo tracks no notes, and `notes/` is a cache — so the object this removes
    was the only copy of it there was. `npm run notes:publish` is what puts a
    note back, from whatever the browser saved.

    200 and both the object and its line in the manifest are gone. 404 if
    there was nothing there, rather than the success S3 would report for
    deleting what does not exist: a name typed wrong should say so.
    """
    if unconfigured := _unconfigured():
        return unconfigured

    if not NOTE_NAME.match(slug):
        return jsonify(error="not a note name"), 400

    if refused := _wrong_password():
        return refused

    if not _within(_accepted, UPLOADS_PER_MINUTE):
        return jsonify(error="too many notes written just now — try again shortly"), 429

    key = f"{PREFIX}/{slug}.json"
    there = _exists(key)
    if there is None:
        return jsonify(error="the notes bucket cannot be reached"), 503
    if not there:
        return jsonify(error="no such note"), 404

    if not _delete(key):
        return jsonify(error="the note could not be taken down"), 503

    # The note is gone either way: it stops answering the moment the object
    # does. A manifest that did not get written leaves a line pointing at
    # nothing, which `notes:manifest` clears — worth saying rather than
    # reporting as a failed delete and inviting a second press.
    listed = _unlist_note(slug)

    return jsonify(slug=slug, path=f"/notes/{slug}", unlisted=listed), 200
