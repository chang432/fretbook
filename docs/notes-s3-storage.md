# Published notes in S3

The published notes used to be files in `public/notes/`, baked into each
environment's image by `vite-plugin-notes.js`. They now live in a **public S3
bucket, one per environment**, and the browser reads them straight out of it.

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

## Publishing

```bash
export FRETBOOK_NOTES_BUCKET=fretbook-notes-dev     # or pass --bucket

npm run notes:publish   -- notes/passionfruit_by_drake.json
npm run notes:publish   -- notes/*.json              # seed a fresh bucket
npm run notes:unpublish -- passionfruit_by_drake     # the name, not a path
npm run notes:manifest                               # rebuild notes.json only
```

The repo's `notes/` folder is **local copies, not the source of truth** — a
place to keep the exports you have published from. Deleting a file there
publishes nothing and unpublishes nothing.

Credentials are the AWS CLI's own (`aws configure`, or `AWS_*` in the
environment); the script neither reads nor stores one. `notes:manifest` is the
repair tool: run it if an upload is interrupted, or after dropping an object in
by hand.

## Cost estimate

AWS S3, `eu-west-3`, at this app's scale — a few dozen notes of ~10–50 KB, read
by a handful of people:

| Item | Rate | This app |
|---|---|---|
| Storage | $0.024 / GB-month | < 5 MB → **$0.00** (rounds to nothing) |
| PUT / LIST requests | $0.005 / 1,000 | publishing is tens of requests a month → **$0.00** |
| GET requests | $0.0004 / 1,000 | 10,000 note views/month → **$0.004** |
| Data transfer out | $0.09 / GB after 100 GB free | ~0.5 GB/month → **$0.00** (within the free tier) |

**Expected: well under $0.10/month for both buckets combined**, and the first
12 months fall inside the free tier's 5 GB and 20,000 GETs. Two things could
change that, neither of them accidental: serving the bucket to real traffic
(transfer past 100 GB/month), or a bucket being scraped — a public bucket's
objects are readable by anyone who knows a URL, so egress is the one line with
no ceiling on it. CloudFront in front of the bucket is the fix if that ever
happens, and it would not change any of the app code — only the value of
`*_NOTES_BASE_URL`.

Nothing here is a new paid service: the AWS account already holds Route 53 and
the Terraform state bucket.

## Manual Setup Required From Owner

All of this is in the AWS console (or the CLI) and GitHub settings; none of it
is created by the repo.

### 1. Two buckets

Create `fretbook-notes-dev` and `fretbook-notes-prod` in one region (pick one
near the VPS — `eu-west-3` Paris, say). For **each**:

- **Object Ownership**: ACLs disabled (the default). The policy below does the
  publishing, not per-object ACLs.
- **Block Public Access**: untick *Block all public access*, and specifically
  leave **"Block public access to buckets and objects granted through new or
  any public bucket policies" off**. The two ACL blocks can stay on.
- **Versioning**: on. It costs the same pennies and means republishing a note
  over itself is recoverable.

### 2. Bucket policy — public read, per bucket

Note the two separate resource lines: objects are public, the bucket itself is
not, so **nobody can list what is in it**. The manifest is the only index.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadNotes",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::fretbook-notes-dev/notes.json",
        "arn:aws:s3:::fretbook-notes-dev/notes/*"
      ]
    }
  ]
}
```

### 3. CORS — per bucket

The browser reads the bucket cross-origin, so without this the fetch fails
even though the object is public. `GET` and `HEAD` only; no credentials, no
other method.

```json
[
  {
    "AllowedHeaders": [],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://<PROD_DOMAIN>",
      "https://<DEV_DOMAIN>",
      "http://localhost:5173",
      "http://localhost:8080"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

Use the dev bucket's CORS for the two `localhost` origins (`5173` is
`npm run dev`, `8080` is `docker compose up`); the prod bucket needs only
`https://<PROD_DOMAIN>`.

### 4. An IAM user or role to publish with

Only your laptop writes to these buckets — CI does not. Give it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::fretbook-notes-dev/*",
        "arn:aws:s3:::fretbook-notes-prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": [
        "arn:aws:s3:::fretbook-notes-dev",
        "arn:aws:s3:::fretbook-notes-prod"
      ]
    }
  ]
}
```

`ListBucket` is what `notes:manifest` walks; `GetObject` is how it reads each
title back.

### 5. Two repository variables

Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value |
|---|---|
| `DEV_NOTES_BASE_URL` | `https://fretbook-notes-dev.s3.eu-west-3.amazonaws.com` |
| `PROD_NOTES_BASE_URL` | `https://fretbook-notes-prod.s3.eu-west-3.amazonaws.com` |

No trailing slash (one is stripped anyway). **The next deploy fails fast if
either is missing** — deliberately, since the alternative is a silently empty
`/notes` page.

### 6. Seed the buckets before merging

The six notes that used to ship with the site are in `notes/`. Until they are
uploaded, `/notes` is empty on a deployed environment:

```bash
FRETBOOK_NOTES_BUCKET=fretbook-notes-dev  npm run notes:publish -- notes/*.json
FRETBOOK_NOTES_BUCKET=fretbook-notes-prod npm run notes:publish -- notes/*.json
```

### 7. Locally (optional)

```bash
cp .env.example .env.local      # already git-ignored
```

Point it at the dev bucket to see the published notes under `npm run dev`.
