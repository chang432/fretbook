# Publishing from the editor

**Publish** in the editor's toolbar puts the sheet in this environment's notes
bucket, at a URL anyone can open, without a laptop, a terminal or an export
file in between.

**Update** and **Delete**, on a published note, write that sheet back over the
note or take it down. Those two are the presses that need a password.

```
browser ──► PUT    /api/notes/<name>   publish: the export as the body, open
        ├─► POST   /api/notes/<name>   update: the same, plus a password header
        └─► DELETE /api/notes/<name>   unpublish: the password, no body
                │  same origin, so no CORS
                ▼
        Caddy handle /api/*  ──►  Flask + boto3  ──►  R2 (private)
                                      │  HeadObject        is the name free, or there?
                                      │  Put/DeleteObject  notes/<name>.json
                                      └─ PutObject         notes.json, rewritten
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

What is left of the argument is a narrower claim: the **open** route can add a
note and nothing else, and the routes that can do more are not open.

| | |
|---|---|
| A name is claimed once | PUT onto an existing key is refused with 409, not written over it |
| Writing over one takes the password | POST, and only POST, replaces a note |
| Taking one down takes the password | DELETE, and only DELETE, removes one |
| The manifest is read and rewritten | not rebuilt by listing, so no `ListBucket` is needed either |

That 409 is doing most of the work. **R2 has no object versioning**, the repo
tracks no notes, and `notes/` is a cache rather than a copy — so a write over a
note destroys it, with nothing to restore from
([notes-pull-from-r2.md](notes-pull-from-r2.md)). Refusing a taken name is what
keeps the open route from being able to do that; the password is what stands in
front of the two that can. `npm run notes:unpublish` still does the same job
from a machine that holds the token, and is the way to it on an environment
with no password set.

## Who can publish

**Anyone who opens the site.** There are no accounts, nothing is signed in, and
the route asks for no secret. That is a deliberate choice and worth writing
down plainly: a stranger can add notes to the dev and production buckets, and
the only limits on what they add are the ones below.

| Guard | What it is | What it is not |
|---|---|---|
| 409 on a taken name | nothing published can be changed or removed without the password | no protection against *new* junk notes |
| Envelope check | `format`, `version`, a string title and non-empty `rows`/`columns` must be there, so a reader never meets a note the editor cannot open | not `fromJson` — the full judgement is still the browser's |
| 512 KB body limit | Flask's own `MAX_CONTENT_LENGTH`, so an oversized body is refused before it is read into memory | a sheet is a few KB, so this is a ceiling rather than a constraint |
| 120-character title | the line `/notes` lists is clipped; the note keeps its own bytes | nothing stops a silly title, only a huge one |
| 20 uploads a minute | one deque in each gunicorn worker; the difference between a loop adding a few notes and one adding a hundred thousand | not per-caller, not shared between workers, and not a defence |

If that becomes a problem, the password the update route below already uses can
be put in front of publishing too: the pieces — the header, the comparison, the
guess cap, the field in the panel — are all written, and would only need
calling from the other route. Cloudflare's own rate limiting in front of the
site is the other half of the same answer.

## Updating a note, and taking one down

`POST /api/notes/<slug>` replaces the note at that name with the sheet in the
body. `DELETE /api/notes/<slug>` removes it, object and manifest line together.
They are deliberately separate routes rather than one in three moods: **PUT can
only add a note, POST can only replace one, DELETE can only remove one**, so
none can quietly do another's job, and a mistyped name cannot publish a stray
copy — both of the password ones answer 404 when there is no note there, rather
than the success S3 reports for deleting what does not exist.

They share the password because they are the same kind of act: what they touch
does not survive them.

| Guard | What it is |
|---|---|
| The password | `X-Fretbook-Password`, compared against `FRETBOOK_PUBLISH_PASSWORD` with `hmac.compare_digest`, before the body is read at all |
| No password set | 503, rather than an empty password that happens to match — an environment opts into being updatable |
| 5 wrong a minute | per worker, checked *before* the comparison, since a cap applied after a guess has been tested caps nothing |
| A header, not a URL | a query string is logged by every hop that sees it |
| Everything PUT has | POST takes the same body limit, envelope check and write cap; DELETE has no body and takes the cap |

The password goes over HTTPS to the site's own origin, is **never stored by the
browser** — not in `localStorage`, not between panels — and is typed for the
press that uses it. There is one password per environment and no accounts: it
says *this press is the owner's*, and nothing more. Rolling it is one
repository secret and a redeploy.

Checking the cap before the comparison means a minute of sustained guessing
also locks the owner out for the rest of that minute. That is the cheaper half
of the trade, and the window clears itself.

A published note carries **Update** and **Delete** where the editor carries
Publish. Update is dead until the sheet differs from the note as it was opened,
so a stray press cannot rewrite a note with itself, and both go dead once the
note is gone. Each panel says what it is about to do before it asks for
anything: *this replaces the published note; there are no versions to go back
to*, or *this takes the note down for good*.

They are visible to every reader, not only to whoever holds the password. The
password is the control; hiding the buttons is not. A reader who presses one
learns only that these notes can be edited by someone.

A delete leaves the sheet on screen with nothing behind it, and the receipt
points at `/notes` rather than at a note that is not there any more. That is
also the only way back from one: **Export → JSON file**, then `notes:publish`.

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

An update rewrites the same line rather than adding one, so a title changed in
the editor follows the note into `/notes`; a delete takes the line out.

A write of either kind also drops its own two keys from the backend's
60-second cache, so a note is listed and readable immediately rather than
within the minute.

## What the reader sees

The panel asks for one thing — the name, which is the URL — prefilled from the
title the way an export's filename already is. `slugify` shapes a title into a
publishable name, so the common case is a glance and a press.

Afterwards the panel stays open holding the link, rather than closing. This is
the one action in the editor that cannot be repeated, undone or taken back, and
a panel that vanishes on success would be hiding exactly the thing worth
reading.

**Publish is not offered while a published note is open** — Update is, in its
place. Publishing a second copy of a note under a second name is not what
anyone opening one wants, and the button that is there instead aims at the note
in front of them.

One panel serves both, since the shape is the same — one field, one press, one
receipt — and only what is asked for, and what it costs, differ.

## Cost estimate

Writes are Class A operations, which is the dearer of R2's two classes and
still not dear.

| Item | Free each month | Rate past it | This change |
|---|---|---|---|
| Class A (writes) | 1,000,000 | $4.50 / million | 2 per publish, update or delete (the note, the manifest) → **$0.00** |
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

That permission covers `DeleteObject` as well as `PutObject`, so the Delete
button needs nothing further than this step — and if a delete ever answers 503
where a publish works, the token is the first thing to look at.

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

### 3. Set a publish password, if Update and Delete should work

Repository secret `PUBLISH_PASSWORD`, under Settings → Secrets and variables →
Actions. `deploy.yml` passes it into the stack's env file as
`FRETBOOK_PUBLISH_PASSWORD`.

It is **optional, and the deploy does not fail without it**: unset, Update and
Delete answer 503 and everything else works, which is the right default for an
environment nobody edits notes on. Make it long and random — it is the one
secret in front of the two routes that can destroy a note, and the cap on
guessing is 5 a minute per worker, not a wall.

### 4. Decide whether dev and production should both be open

They both will be, since they run the same image and the route has no switch.
If production should not be, that is the passphrase above, and it is worth
asking for before the site is somewhere findable.

### 5. Locally

`docker/app/.env` needs a token that can write — the `r2` profile's own will
do — plus `FRETBOOK_PUBLISH_PASSWORD` if Update and Delete should work there:

```bash
eval "$(aws configure export-credentials --profile r2 --format env)"
npm run stack    # builds and starts both containers on :8080
npm run dev      # 5173, proxying /api to 8080
```

**Publish in a local editor writes to a real bucket** — whichever
`FRETBOOK_NOTES_BUCKET` names, which is `fretbook-notes-dev` in
`docker/app/.env.example`. There is no local R2, so there is no dry run: a test press
leaves a note in the dev bucket, and `npm run notes:unpublish -- <name>` is how
it goes away.
