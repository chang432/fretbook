# Publishing from the editor

**Publish** in the editor's toolbar puts the sheet in this environment's notes
bucket, at a URL anyone can open, without a laptop, a terminal or an export
file in between.

```
browser ──► PUT /api/notes/<name>     the editor's own JSON export as the body
                │  same origin, so no CORS
                ▼
        Caddy handle /api/*  ──►  Flask + boto3  ──►  R2 (private)
                                      │  HeadObject   is the name free?
                                      │  PutObject    notes/<name>.json
                                      └─ PutObject    notes.json, rewritten
```

It is the same hop `GET /api/notes/<slug>` already was, in the other
direction, and for the same reason: **a browser cannot sign an S3 request.**
Signing needs the R2 token, and anything in the bundle is readable by anyone
who opens devtools — so the backend is the end that writes, exactly as it is
the end that reads ([notes-via-s3-client.md](notes-via-s3-client.md)).

The body is byte for byte what **Export → JSON file** writes, and it is stored
unchanged, so a note published this way is indistinguishable from one
`npm run notes:publish` uploaded. One publishing path, one object layout, one
manifest.

## What this gives up

The backend's token was **Object Read only**, and the argument for that was
good: a web server that only ever reads has no business holding a token that
can delete. That is now **Object Read & Write**, which is the real cost of this
feature and the thing to weigh if it ever goes wrong.

What is left of the argument is a narrower claim: the route can **add** a note
and nothing else.

| | |
|---|---|
| A name is claimed once | an upload onto an existing key is refused with 409, not written over it |
| Nothing is deleted | there is no delete route, and the backend never calls `DeleteObject` |
| The manifest is read and rewritten | not rebuilt by listing, so no `ListBucket` is needed either |

That 409 is doing most of the work. **R2 has no object versioning**, the repo
tracks no notes, and `notes/` is a cache rather than a copy — so a write over a
note destroys it, with nothing to restore from
([notes-pull-from-r2.md](notes-pull-from-r2.md)). Refusing a taken name is what
keeps an open route from being able to do that. Replacing a note, and taking
one down, stay `npm run notes:publish` and `npm run notes:unpublish` from a
machine that holds the token on purpose.

## Who can publish

**Anyone who opens the site.** There are no accounts, nothing is signed in, and
the route asks for no secret. That is a deliberate choice and worth writing
down plainly: a stranger can add notes to the dev and production buckets, and
the only limits on what they add are the ones below.

| Guard | What it is | What it is not |
|---|---|---|
| 409 on a taken name | nothing published can be changed or removed through the app | no protection against *new* junk notes |
| Envelope check | `format`, `version`, a string title and non-empty `rows`/`columns` must be there, so a reader never meets a note the editor cannot open | not `fromJson` — the full judgement is still the browser's |
| 512 KB body limit | Flask's own `MAX_CONTENT_LENGTH`, so an oversized body is refused before it is read into memory | a sheet is a few KB, so this is a ceiling rather than a constraint |
| 120-character title | the line `/notes` lists is clipped; the note keeps its own bytes | nothing stops a silly title, only a huge one |
| 20 uploads a minute | one deque in each gunicorn worker; the difference between a loop adding a few notes and one adding a hundred thousand | not per-caller, not shared between workers, and not a defence |

If that becomes a problem, the next step is a **publish passphrase**: one secret
in the backend's environment, sent with the upload, and 401 without it. It is
about fifteen lines at this end and a field in the panel at the other, and it
needs no accounts. Cloudflare's own rate limiting in front of the site is the
other half of the same answer.

## The manifest

`notes.json` is read, the new line is added, and the whole thing is written
back — rather than rebuilt by listing the bucket, which is what `notes:manifest`
does. That is what keeps `ListBucket` off the token, and it has one consequence
worth knowing: **two uploads landing in the same second can lose one of the two
lines**, because each read the manifest before the other wrote it. The note
itself is never lost — it is already at its own URL — it is only unlisted, and
`npm run notes:manifest` puts it back.

At this app's rate of publishing, that is a race that will not happen; the
repair for it existed before this change, which is why it is acceptable at all.

A publish also drops its own two keys from the backend's 60-second cache, so a
note is listed and readable immediately rather than within the minute.

## What the reader sees

The panel asks for one thing — the name, which is the URL — prefilled from the
title the way an export's filename already is. `slugify` shapes a title into a
publishable name, so the common case is a glance and a press.

Afterwards the panel stays open holding the link, rather than closing. This is
the one action in the editor that cannot be repeated, undone or taken back, and
a panel that vanishes on success would be hiding exactly the thing worth
reading.

**Publish is not offered while a published note is open.** That sheet is
already in the bucket, and the editor behind it is a reader's copy — the same
reason autosave is off there.

## Cost estimate

Writes are Class A operations, which is the dearer of R2's two classes and
still not dear.

| Item | Free each month | Rate past it | This change |
|---|---|---|---|
| Class A (writes) | 1,000,000 | $4.50 / million | 2 per publish (the note, the manifest) → **$0.00** |
| Class B (reads) | 10,000,000 | $0.36 / million | 1 HeadObject + 1 GetObject per publish → **$0.00** |
| Standard storage | 10 GB-month | $0.015 / GB-month | a note is tens of KB; 10,000 of them is < 500 MB → **$0.00** |
| Egress | unlimited — R2 charges none | — | **$0.00** |

**Still $0.00/month**, and the rate limit above caps the worst case at ~29,000
uploads a day per worker — roughly 60,000 Class A operations, which is still
inside the free million a month. Storage is the line that an abused route would
eventually move, not requests: a sustained flood is a few hundred MB a month.

## Manual Setup Required From Owner

### 1. Widen the backend's R2 token to Object Read & Write

Cloudflare → R2 → **Manage API tokens**. R2 tokens cannot be edited in place,
so this is: create a new token with permission **Object Read & Write**, scoped
to `fretbook-notes-dev` and `fretbook-notes-prod`; update the two repository
secrets below; redeploy; then delete the old read-only token.

The laptop's existing read-write token is unaffected — keep it where it is.
Using one token for both ends works and is one fewer thing to hold, but keeping
them separate means either can be rolled without the other noticing.

### 2. Update the two repository secrets

Settings → Secrets and variables → Actions:

| | Name | Value |
|---|---|---|
| Secret | `R2_ACCESS_KEY_ID` | the **read & write** token from step 1 |
| Secret | `R2_SECRET_ACCESS_KEY` | the same token's secret |

`R2_ENDPOINT` does not change. A deploy that runs before these are updated
leaves a site where `/notes` reads fine and **Publish** answers 503 — a note
that could not be written, rather than a stack that will not come up.

### 3. Decide whether dev and production should both be open

They both will be, since they run the same image and the route has no switch.
If production should not be, that is the passphrase above, and it is worth
asking for before the site is somewhere findable.

### 4. Locally

`docker/app/.env` needs a token that can write — the `r2` profile's own will do:

```bash
eval "$(aws configure export-credentials --profile r2 --format env)"
npm run stack    # builds and starts both containers on :8080
npm run dev      # 5173, proxying /api to 8080
```

**Publish in a local editor writes to a real bucket** — whichever
`FRETBOOK_NOTES_BUCKET` names, which is `fretbook-notes-dev` in the template
that script writes. There is no local R2, so there is no dry run: a test press
leaves a note in the dev bucket, and `npm run notes:unpublish -- <name>` is how
it goes away.
