# Published notes in R2

The published notes used to be files in `public/notes/`, baked into each
environment's image by `vite-plugin-notes.js`. They now live in a **public
Cloudflare R2 bucket, one per environment**, and the browser reads them
straight out of it.

Two consequences, and they are the point:

- **Publishing is no longer a deploy.** A note is uploaded with
  `npm run notes:publish`; it is live immediately, and nothing is rebuilt.
- **A deploy no longer carries notes.** `dev` and `main` ship the same code and
  differ only in which bucket their bundle was built against.

## How it fits together

```
browser ──► https://<site>/notes            the app, served by Caddy from the image
        └─► https://<bucket>/notes.json     the manifest the index lists
        └─► https://<bucket>/notes/<name>.json   one note
```

| Bucket object | What it is |
|---|---|
| `notes.json` | `[{ slug, title }]`, in the order `/notes` lists them |
| `notes/<name>.json` | one note — the editor's own JSON export, unchanged |

Notes sit under a prefix and the manifest does not, so no note is barred from
being called `notes`.

The bucket's URL reaches the bundle as `VITE_NOTES_BASE_URL`, which Vite inlines
at build time. That is why it is a **Docker build arg** (`NOTES_BASE_URL`) rather
than a runtime variable: the `web` image for dev and the one for prod are built
from the same source with different values.

```
repo variable DEV_NOTES_BASE_URL ─► deploy.yml ─► /opt/fretbook-dev-deploy.env
  ─► compose build arg NOTES_BASE_URL ─► ENV VITE_NOTES_BASE_URL ─► npm run build
```

The checks the build used to do — a note's name is a legal URL, and the file is
an export the editor can open — moved into `scripts/notes.mjs`, which is now the
only moment a note is looked at. It refuses a bad file before uploading it, and
rebuilds `notes.json` from the bucket's actual contents afterwards rather than
editing it, so the manifest cannot drift from the notes it lists.

A build given no bucket still works: `/notes` says it was not told where the
notes are, instead of fetching a nonsense URL.

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

```bash
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
export FRETBOOK_NOTES_BUCKET=fretbook-notes-dev     # or pass --bucket
export AWS_PROFILE=r2                                # the R2 token, not your AWS keys

npm run notes:publish   -- notes/passionfruit_by_drake.json
npm run notes:publish   -- notes/*.json              # seed a fresh bucket
npm run notes:unpublish -- passionfruit_by_drake     # the name, not a path
npm run notes:manifest                               # rebuild notes.json only
```

The repo's `notes/` folder is **local copies, not the source of truth** — a
place to keep the exports you have published from. Deleting a file there
publishes nothing and unpublishes nothing.

It does matter more here than it would on S3, though: **R2 has no object
versioning** (`PutBucketVersioning` is unimplemented), so republishing a note
over itself, or unpublishing one, is final. The copy in `notes/` is the backup.

`notes:manifest` is the repair tool: run it if an upload is interrupted, or
after dropping an object in by hand.

## Cost estimate

Cloudflare R2, at this app's scale — a few dozen notes of ~10–50 KB, read by a
handful of people:

| Item | Free each month | Rate past it | This app |
|---|---|---|---|
| Standard storage | 10 GB-month | $0.015 / GB-month | < 5 MB → **$0.00** |
| Class A (writes, lists) | 1,000,000 | $4.50 / million | tens a month → **$0.00** |
| Class B (reads) | 10,000,000 | $0.36 / million | ~10,000 a month → **$0.00** |
| Egress | unlimited — R2 charges none | — | **$0.00** |

**Expected: $0.00/month for both buckets**, by three or four orders of
magnitude, and that holds even if the site gets genuinely popular. The free
tier is per *account*, so it is shared with anything else you put in R2.

Egress being free is the substantive difference from S3, where bandwidth was
the one line with no ceiling on it. The ceiling here is not money but the
r2.dev rate limit — see below.

## Manual Setup Required From Owner

All of this is in the Cloudflare dashboard and GitHub settings; none of it is
created by the repo.

### 1. Two buckets

R2 → **Create bucket**: `fretbook-notes-dev` and `fretbook-notes-prod`. Pick a
location hint near the VPS (EU) if offered; everything else can stay default.

There is no versioning setting to turn on — R2 does not have one.

### 2. Make each one public (Public Development URL)

Bucket → **Settings** → **Public Development URL** → **Enable**, type `allow`
to confirm, and check that **Public URL Access** reads *Allowed*. Cloudflare
hands back a URL of the form:

```
https://pub-<32 hex characters>.r2.dev
```

That is the value of the repo variable in step 5.

Two things to know about it, both deliberate trade-offs we took:

- **Cloudflare rate-limits r2.dev and says it is for development only.** There
  is no CDN caching, no WAF and no bot management on it. At this site's traffic
  that is fine; a sustained burst would get 429s rather than a bill.
- **Moving to a custom domain later costs one variable.** It needs a zone in
  the same Cloudflare account as the bucket (DNS is on Route 53 today, so that
  means moving a zone or delegating a subdomain). Nothing in the app changes —
  only the value of `*_NOTES_BASE_URL`.

Also note that R2 has **no bucket policy**: public is a per-bucket switch, not a
per-prefix grant. Every object in these buckets is world-readable, so put
nothing in them but notes. Listing is not exposed — a public bucket will not
list its contents — so `notes.json` remains the only index.

### 3. CORS — per bucket

The browser reads the bucket cross-origin, so without this the fetch fails even
though the object is public. The policies differ only in their origins: the
prod bucket is read from one place, the dev bucket from four.

The app only ever makes a plain `GET` with no custom headers, which is a
*simple request* — the browser sends no preflight, and all that has to come
back is `Access-Control-Allow-Origin`. That is why the header lists are empty;
`MaxAgeSeconds` governs preflight caching and so does nothing today, but costs
nothing to carry.

**`fretbook-notes-prod`:**

```json
[
  {
    "AllowedOrigins": ["https://<PROD_DOMAIN>"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

**`fretbook-notes-dev`** — the same, plus the three ways the site runs locally:

```json
[
  {
    "AllowedOrigins": [
      "https://<DEV_DOMAIN>",
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:8080"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

`5173` is `npm run dev`, `4173` is `npm run preview`, `8080` is
`docker compose up`. `localhost` and `127.0.0.1` are different origins, so add
the latter too if that is what you type.

Paste either straight into the bucket's **Settings** → **CORS Policy** →
**Add CORS policy** → **JSON**, which takes exactly this shape. The same rules
go through the CLI the publishing script already uses, wrapped in `CORSRules`:

```bash
aws s3api put-bucket-cors --bucket fretbook-notes-dev \
  --endpoint-url https://<account id>.r2.cloudflarestorage.com --region auto \
  --cors-configuration '{"CORSRules": [{"AllowedOrigins": ["https://<DEV_DOMAIN>","http://localhost:5173","http://localhost:4173","http://localhost:8080"],"AllowedMethods": ["GET","HEAD"]}]}'
```

`wrangler r2 bucket cors set` is a third route, but it takes a different shape
again — `{ "rules": [ { "allowed": { "origins": [...], "methods": [...] } } ] }`
— so pick one route and stay on it.

Two things that make this look broken when it is not: a request without an
`Origin` header gets no CORS headers back, so test with
`curl -I -H 'Origin: https://<DEV_DOMAIN>' <bucket URL>/notes.json` rather than
a bare curl; and listing the origins is not access control — the objects are
public to anything that is not a browser either way. What it buys is that a
copy of the site on someone else's domain cannot read your bucket from a page.

### 4. An R2 API token to publish with

Only your laptop writes to these buckets — CI does not.

R2 → **Manage API tokens** → **Create API token**, permission **Object Read &
Write**, scoped to the two buckets. It gives you an **Access Key ID**, a
**Secret Access Key**, and the account endpoint
`https://<account id>.r2.cloudflarestorage.com`.

Keep it apart from the AWS credentials that Route 53 and the Terraform state
bucket use — these are different keys for a different provider:

```bash
aws configure --profile r2       # region: auto, output: json
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
```

### 5. Two repository variables

Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value |
|---|---|
| `DEV_NOTES_BASE_URL` | the dev bucket's `https://pub-….r2.dev` |
| `PROD_NOTES_BASE_URL` | the prod bucket's `https://pub-….r2.dev` |

No trailing slash (one is stripped anyway). **The next deploy fails fast if
either is missing** — deliberately, since the alternative is a silently empty
`/notes` page.

### 6. Seed the buckets before merging

The six notes that used to ship with the site are in `notes/`. Until they are
uploaded, `/notes` is empty on a deployed environment:

```bash
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com

FRETBOOK_NOTES_BUCKET=fretbook-notes-dev  npm run notes:publish -- notes/*.json
FRETBOOK_NOTES_BUCKET=fretbook-notes-prod npm run notes:publish -- notes/*.json
```

### 7. Locally (optional)

```bash
cp .env.example .env.local      # already git-ignored
```

Point it at the dev bucket to see the published notes under `npm run dev`.
