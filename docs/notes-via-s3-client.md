# Notes over the S3 API only

Today the browser reads the notes bucket directly, over its public
`pub-….r2.dev` URL. This moves every read onto the S3 API, which means the
bucket stops being public and the notes come through the app's own backend.

**A browser cannot sign an S3 request.** Signing needs the R2 token, and
anything in the bundle is readable by anyone who opens devtools. So "no public
endpoint" necessarily means a hop: the app asks its own origin, and the backend
— which can hold a credential — is what speaks S3.

```
before                                  after
──────────────────────────────          ────────────────────────────────────
browser ──► pub-….r2.dev                browser ──► /api/notes
            (public bucket)                         (same origin, no CORS)
                                                      │ Caddy handle /api/*
                                                      ▼
                                                    Flask + boto3
                                                      │ SigV4, read-only token
                                                      ▼
                                                    R2 (private)
```

Caddy already proxies `/api/*` to the backend, and `api.py` already calls
itself "the seam to hang real endpoints off as they arrive". This is that.

## What goes away

More than arrives, which is the argument for doing it:

| | |
|---|---|
| The Public Development URL | both buckets become private |
| The CORS policy | the fetch is same-origin, so there is nothing to allow |
| The r2.dev rate limit | Cloudflare's dev-only URL is off the path entirely |
| `VITE_NOTES_BASE_URL` | the app asks its own origin; there is no URL to inline |
| `NOTES_BASE_URL` build arg | nothing environment-specific is baked in any more |
| `DEV_NOTES_BASE_URL` / `PROD_NOTES_BASE_URL` | two repository variables, and their fail-fast check |
| `notesConfigured` | a build can no longer be "not told where the notes are" |

The last one is the real prize: **the dev and prod web images become
identical.** That variable was the only thing that differed between them, which
is why the bucket had to be a build arg rather than a setting. The bucket moves
to a *runtime* environment variable on the backend, so one image serves either
environment and `docker/app/caddy/Dockerfile` loses its build stage's one
parameter.

## What arrives

### Two endpoints

```
GET /api/notes          →  [{ slug, title }]      the manifest
GET /api/notes/<slug>   →  the note's own JSON
```

Both are `GetObject` against the same keys that exist today — `notes.json` and
`notes/<slug>.json`. The manifest is still the index: the backend reads that one
small object rather than listing the bucket, so **the token it holds needs
`GetObject` and nothing else.** No list, no write, no delete.

`<slug>` is matched against `^[a-z0-9]+([-_][a-z0-9]+)*$` — the same
`NOTE_NAME` the publisher enforces — before it reaches a key. A bucket key is
not a filesystem path, but a slug is user input being concatenated into one, and
the pattern is already written down.

A missing key is a 404 with a JSON body, and so is an object that is not valid
JSON. Whether it is an export the *editor* can open stays the frontend's call —
that test is `fromJson`, which lives in `src/utils/tab.js` and has no Python
counterpart worth writing twice. So the split is: the backend rejects what is
not JSON, the browser rejects what is not a sheet, exactly as it did when it
read the bucket itself.

A manifest that is missing or unreadable answers `[]` rather than an error,
which keeps the index page's "nothing has been published yet" honest for a
bucket that genuinely holds nothing.

### A 60-second cache in the backend

`/notes` fetches the manifest on every visit, and today R2 answers that with
`Cache-Control: no-cache` because a publish has to show up immediately. Through
a proxy the same object would be fetched from R2 once per page view, so the
backend keeps a small TTL cache — 60 seconds, the same window `notes:publish`
already puts on a note. A publish takes up to a minute to appear instead of
being instant, which is the one behaviour this change makes slightly worse.

The response carries `Cache-Control` so the browser caches too: `no-cache` on
the manifest, `max-age=60` on a note, mirroring what the bucket sends today.

### boto3, and a read-only token on the VPS

`boto3` joins the backend's two dependencies. It is the S3 client; writing SigV4
by hand to avoid it would be the wrong kind of frugal.

**The VPS gets its own R2 token, Object Read only, and not the one on your
laptop.** The laptop's token can write and delete; a web server that only ever
reads has no business holding that, and the two being separate means either can
be rolled without touching the other.

### A Vite dev proxy

`npm run dev` serves the frontend on 5173 with no backend behind it, so `/api`
would 404. `vite.config.js` gains a proxy pointing `/api` at
`http://localhost:8080` — the compose stack — overridable with
`VITE_API_PROXY`.

This is a real cost: **frontend work on `/notes` now needs
`docker compose up` alongside `npm run dev`**, where before it needed only a
URL in `.env.local`. Editing tab, which is most of the app, is unaffected.

## The trade this makes

| | |
|---|---|
| Lost | `/notes` now depends on the backend being up. Before, a dead gunicorn left the published notes readable, because the browser went straight to R2 |
| Lost | a publish shows up within 60s rather than instantly |
| Lost | local `/notes` needs the compose stack, not just an env var |
| Gained | nothing is world-readable; the bucket is private |
| Gained | no CORS, no r2.dev rate limit, no CDN-less public URL to outgrow |
| Gained | one image for both environments, two fewer repository variables |
| Gained | a custom domain for the bucket stops being a thing to want |

The backend already has a healthcheck and `restart: unless-stopped`, so the
first row is a smaller risk than it reads — but it is a new way for `/notes` to
be down, and it did not exist before.

## Code changes

| File | Change |
|---|---|
| `docker/app/backend/app/notes.py` | new — the boto3 client, the two routes, the TTL cache |
| `docker/app/backend/app/__init__.py` | register the blueprint |
| `docker/app/backend/requirements.txt` | `boto3` |
| `docker/app/docker-compose.yml` | backend gets the bucket, endpoint and credentials; `web` loses its build arg |
| `docker/app/caddy/Dockerfile` | drop `ARG NOTES_BASE_URL` / `ENV VITE_NOTES_BASE_URL` |
| `docker/app/caddy/Caddyfile` | the comment about notes coming from R2 directly |
| `src/utils/notes.js` | same-origin `/api` paths; `notesConfigured` goes |
| `src/components/NoteIndex.jsx` | drop the "not told where the notes are" branch |
| `vite.config.js` | the `/api` dev proxy |
| `.github/workflows/deploy.yml` | drop both `*_NOTES_BASE_URL`; add the R2 credentials and bucket per environment |
| `.env.example` | `VITE_NOTES_BASE_URL` out, `VITE_API_PROXY` in |

`scripts/notes.mjs` does not change. It already speaks only S3, and the
manifest it writes is the same object the backend now reads.

## Cost estimate

R2 stays free at this scale; what changes is *who* pays the request.

| Item | Free each month | Rate past it | After this change |
|---|---|---|---|
| Class B (gets) | 10,000,000 | $0.36 / million | one per page view at worst, far fewer with the TTL cache → **$0.00** |
| Class A | 1,000,000 | $4.50 / million | publishing only, unchanged → **$0.00** |
| Egress from R2 | unlimited — R2 charges none | — | **$0.00** |
| VPS bandwidth | whatever the plan allows | — | notes now transit the VPS: ~10–50 KB per note read |

**Still $0.00/month.** The one new line is VPS bandwidth, and a few dozen notes
of tens of kilobytes will not register against any VPS allowance.

## Manual Setup Required From Owner

In order. Steps 1 and 2 are new; step 3 is what makes the change real, and is
the only one that cannot be undone by a redeploy.

### 1. A read-only R2 API token for the VPS

R2 → **Manage API tokens** → **Create API token**, permission **Object Read
only**, scoped to `fretbook-notes-dev` and `fretbook-notes-prod`. Keep the
existing read-write token where it is: that one is your laptop's.

### 2. Three repository secrets, and one variable

Settings → Secrets and variables → Actions:

| | Name | Value |
|---|---|---|
| Secret | `R2_ACCESS_KEY_ID` | from step 1 |
| Secret | `R2_SECRET_ACCESS_KEY` | from step 1 |
| Variable | `R2_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` |

The bucket name is not among them — `deploy.yml` derives
`fretbook-notes-<env>` from the environment it is already deploying, the same
way it picks a port.

You can then **delete `DEV_NOTES_BASE_URL` and `PROD_NOTES_BASE_URL`**, which
nothing reads after this change.

### 3. Make both buckets private — last, after a deploy has been verified

Bucket → **Settings** → **Public Development URL** → **Disable**, on
`fretbook-notes-dev` first, then `fretbook-notes-prod`.

Do this *after* confirming `/notes` works on the deployed dev site, because
until it is done both paths work and the change is reversible. Afterwards the
old bundle has no way to read a note, so a rollback to a previous image needs
the public URL turned back on.

The **CORS policy can go** at the same time; it allows an origin that no longer
makes the request. Leaving it costs nothing, so it is housekeeping rather than
a step.

### 4. Locally

`.env.local` no longer needs `VITE_NOTES_BASE_URL`. To see `/notes` under
`npm run dev`, bring the stack up alongside it:

```bash
npm run stack    # backend on /api, web on :8080
npm run dev      # 5173, proxying /api to 8080
```

`scripts/stack.sh` is that command: it checks the daemon and the credentials
before starting anything, waits for `/api/health`, and then reports how many
notes `/api/notes` actually returned — because a stack with no bucket behind it
comes up exactly as happily as one with.
