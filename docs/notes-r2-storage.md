# Published notes in R2

The published notes used to be files in `public/notes/`, baked into each
environment's image by `vite-plugin-notes.js`. They now live in a **private
Cloudflare R2 bucket, one per environment**, read over the S3 API by the app's
own backend.

Three consequences, and they are the point:

- **Publishing is no longer a deploy.** A note is uploaded with
  `npm run notes:publish`, or by **Publish** in the editor's own toolbar; it is
  live immediately, and nothing is rebuilt.
- **A deploy no longer carries notes.** `dev` and `main` ship the same code,
  and now the same image: nothing environment-specific is baked in.
- **Nothing is world-readable.** The bucket has no public URL; the only things
  that can reach it are a laptop with its R2 token and the backend with its
  own. [notes-via-s3-client.md](notes-via-s3-client.md) is why it is that way
  round.

## How it fits together

```
browser ──► https://<site>/notes          the app, served by Caddy from the image
        └─► https://<site>/api/notes      the manifest the index lists
        └─► https://<site>/api/notes/<name>   one note
        └─► PUT /api/notes/<name>         publish the sheet in the editor
                    │  same origin, so no CORS
                    ▼
            Caddy handle /api/*  ──►  Flask + boto3  ──►  R2 (private)
```

| Bucket object | What it is |
|---|---|
| `notes.json` | `[{ slug, title }]`, in the order `/notes` lists them |
| `notes/<name>.json` | one note — the editor's own JSON export, unchanged |

Notes sit under a prefix and the manifest does not, so no note is barred from
being called `notes`.

Which bucket an environment serves is the **backend's runtime setting**, not a
build arg, which is what lets one `web` image serve both:

```
repo variable R2_ENDPOINT + secrets ─► deploy.yml ─► /opt/fretbook-dev-deploy.env
  ─► compose env FRETBOOK_NOTES_BUCKET / FRETBOOK_R2_ENDPOINT / AWS_* ─► backend
```

The bucket name is derived rather than configured — `fretbook-notes-${ENV_NAME}`
— the same way the loopback port is picked, so a third name would be a typo and
not a choice.

The backend's token is **Object Read & Write**, because publishing is one of
the things the app does: **Publish** in the editor uploads the sheet to this
environment's bucket, and the browser cannot sign that request any more than it
can sign a read. That route is open and can only *add* a note — a name already
taken is refused rather than overwritten — which is what makes an open write
route tolerable against a bucket with no versioning. Writing over a note is the
other route, **Update** on a published note, and it asks for
`FRETBOOK_PUBLISH_PASSWORD`; nothing deletes.
[notes-upload-from-app.md](notes-upload-from-app.md) is that argument, and what
it gives up.

The checks the build used to do — a note's name is a legal URL, and the file is
an export the editor can open — moved into `scripts/notes.mjs`, which is now the
only moment a note is looked at. It refuses a bad file before uploading it, and
rebuilds `notes.json` from the bucket's actual contents afterwards rather than
editing it, so the manifest cannot drift from the notes it lists.

A stack given no bucket still comes up: `/api/notes` answers 503, and `/notes`
shows an empty shelf rather than an error.

### Why the AWS CLI

R2 speaks the S3 API, so `scripts/notes.mjs` drives the ordinary `aws` CLI
pointed at the account's R2 endpoint. Two notes on how it does that:

- It uses the low-level `s3api` commands rather than `aws s3 cp`. `cp` goes
  through the CLI's transfer manager, which picks checksum algorithms of its
  own — something R2 and the CLI have disagreed about before, surfacing as an
  opaque *unsupported header* error. `s3api` sends exactly the written request,
  and these objects are a few KB each, so nothing is given up.
- It sets `AWS_REQUEST_CHECKSUM_CALCULATION` / `AWS_RESPONSE_CHECKSUM_VALIDATION`
  to `when_required`, which a CLI new enough to read them honours and an older
  one ignores.

`wrangler` is the other option and is the better tool for bucket *settings*
(`wrangler r2 bucket cors set`), but it has no object-listing command, and
listing is how the manifest is rebuilt.

## Publishing

Local setup is one git-ignored file — `cp .env.example .env.local` and fill in
the endpoint and the `r2` profile. A shell variable overrides it, and
`--bucket` overrides both; with nothing said, every command means
**`fretbook-notes-dev`**, and prints the bucket it used as its first line.

Or from the editor: **Publish**, a name, and the sheet is in the bucket. Same
bytes, same keys, same manifest — the backend writes it instead of the `aws`
CLI. A revision is **Update** on the published note itself, with the password;
unpublishing is only here.

```bash
npm run notes:publish   -- notes/passionfruit_by_drake.json
npm run notes:publish   -- notes/*.json              # seed a fresh bucket
npm run notes:unpublish -- passionfruit_by_drake     # the name, not a path
npm run notes:manifest                               # rebuild notes.json only
npm run notes:pull                                   # mirror the bucket locally
npm run notes:check                                  # no notes tracked in git
```

The bucket is **the only place a note lives**. The repo's `notes/` folder is a
git-ignored cache of it: `notes:pull` mirrors the bucket into it — fetching
what is missing, deleting what the bucket no longer has — and `notes:check`,
which CI runs, fails if a note is tracked in git. See
[notes-pull-from-r2.md](notes-pull-from-r2.md) for why it is that way round.

So there is no second copy of a note anywhere, and **R2 has no object
versioning** (`PutBucketVersioning` is unimplemented): republishing a note over
itself, or unpublishing one, is final. That is the accepted cost of one source
of truth, and the mitigation if it ever matters — a second, private bucket for
archives — is written up in the same doc.

`notes:manifest` is the repair tool: run it if an upload is interrupted, or
after dropping an object in by hand.

## Cost estimate

Cloudflare R2, at this app's scale — a few dozen notes of ~10–50 KB, read by a
handful of people:

| Item | Free each month | Rate past it | This app |
|---|---|---|---|
| Standard storage | 10 GB-month | $0.015 / GB-month | < 5 MB → **$0.00** |
| Class A (writes, lists) | 1,000,000 | $4.50 / million | tens a month, publishing included → **$0.00** |
| Class B (reads) | 10,000,000 | $0.36 / million | ~10,000 a month → **$0.00** |
| Egress | unlimited — R2 charges none | — | **$0.00** |

**Expected: $0.00/month for both buckets**, by three or four orders of
magnitude, and that holds even if the site gets genuinely popular. The free
tier is per *account*, so it is shared with anything else you put in R2.

Egress being free is the substantive difference from S3, where bandwidth was
the one line with no ceiling on it. Notes now transit the VPS on their way to a
reader, so that line moves to the VPS's own allowance — tens of kilobytes a
read, which no plan will notice.

## Manual Setup Required From Owner

All of this is in the Cloudflare dashboard and GitHub settings; none of it is
created by the repo.

### 1. Two buckets

R2 → **Create bucket**: `fretbook-notes-dev` and `fretbook-notes-prod`. Pick a
location hint near the VPS (EU) if offered; everything else can stay default.

There is no versioning setting to turn on — R2 does not have one.

### 2. Keep each one private

There is nothing to switch on, which is the point of
[notes-via-s3-client.md](notes-via-s3-client.md). If a bucket was made public
before that change, turn it off now: Bucket → **Settings** → **Public
Development URL** → **Disable**.

Do that only once a deploy has been verified, because until it is done both
paths work and the change is reversible — and afterwards a rollback to an older
image needs the public URL turned back on, since that bundle has no other way
to read a note.

**There is no CORS policy to write.** The fetch is same-origin — the browser
asks the site, not the bucket — so a bucket CORS rule allows an origin that
never makes the request. If one is still set from before, deleting it is
housekeeping rather than a step.

Two things worth knowing anyway, because they are why private is the easier
shape: R2 has **no bucket policy**, so public is a per-bucket switch rather than
a per-prefix grant, and a public bucket **will not list its contents** — which
is why `notes.json` exists as the index at all.

### 4. Two R2 API tokens

**One for your laptop, to publish with.** R2 → **Manage API tokens** → **Create
API token**, permission **Object Read & Write**, scoped to the two buckets. It
gives you an **Access Key ID**, a **Secret Access Key**, and the account
endpoint `https://<account id>.r2.cloudflarestorage.com`.

**One for the server, to read and publish with.** The same again, permission
**Object Read & Write**. The backend signs its `GetObject` calls with this one
and the `PutObject` of a sheet published from the editor. It is separate from
the laptop's on purpose — either can be rolled without touching the other —
rather than because the two differ in power; they no longer do, which is the
cost [notes-upload-from-app.md](notes-upload-from-app.md) weighs. CI itself
needs neither token: it only passes the pair through to the VPS.

Keep it apart from the AWS credentials that Route 53 and the Terraform state
bucket use — these are different keys for a different provider:

```bash
aws configure --profile r2       # region: auto, output: json
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
```

### 5. One repository variable, two secrets

Settings → Secrets and variables → Actions:

| | Name | Value |
|---|---|---|
| Variable | `R2_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` |
| Secret | `R2_ACCESS_KEY_ID` | the **read & write** token from step 4 |
| Secret | `R2_SECRET_ACCESS_KEY` | the same token's secret |
| Secret | `PUBLISH_PASSWORD` | optional — what **Update** on a published note asks for. Unset, that button answers 503 and nothing else changes |

**The next deploy fails fast if any is missing** — deliberately, since the
alternative is a stack that comes up with a silently empty `/notes`.

`DEV_NOTES_BASE_URL` and `PROD_NOTES_BASE_URL` are no longer read by anything
and can be deleted.

### 6. Seed a fresh bucket

Both buckets are seeded. A new one is empty until something is uploaded, and
`/notes` is empty with it, so publish into it from a machine that has pulled
the notes already:

```bash
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com

FRETBOOK_NOTES_BUCKET=fretbook-notes-dev npm run notes:pull
FRETBOOK_NOTES_BUCKET=<the new bucket>   npm run notes:publish -- notes/*.json
```

Pull first, in that order: `notes/` is a mirror of whichever bucket was pulled
last, so publishing out of it without looking is how one environment quietly
overwrites the other.

### 7. Locally

```bash
cp .env.example .env.local      # already git-ignored
```

Three values, and the only local setup there is:

| | |
|---|---|
| `FRETBOOK_R2_ENDPOINT` | the account endpoint the notes commands publish and pull through |
| `AWS_PROFILE` | `r2`, the read-write token from step 4 |

The bucket is not among them: the commands default to `fretbook-notes-dev`, and
production is named when it is meant.

To see `/notes` under `npm run dev`, the backend has to be running too, since
that is what reads the bucket now:

```bash
npm run stack    # builds and starts both containers on :8080
npm run dev      # 5173, proxying /api to 8080
```

`npm run stack` wants the same four values the VPS gets —
`FRETBOOK_NOTES_BUCKET`, `FRETBOOK_R2_ENDPOINT`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` — in the git-ignored `docker/app/.env`, or exported in
the shell, which compose and the script both prefer. It writes the file for you
to fill in the first time, and refuses to start on a half-filled one rather
than leaving you with a silently empty `/notes`.
