# Pulling the notes out of the repo

The bucket is already the source of truth for what readers see — the browser
reads `pub-….r2.dev` directly and a deploy carries no notes
([docs/notes-r2-storage.md](notes-r2-storage.md)). The one thing that has not
caught up is the repo's own `notes/` folder: six tracked JSON files, kept by
hand, documented as "local copies, not the source of truth" while in practice
being the only backup of anything published.

This refactor finishes that move. **`notes/` stops being tracked and becomes a
working copy fetched from the bucket over the S3 API**, with a new
`npm run notes:pull`. The runtime read path, the public bucket, the CORS rule
and `VITE_NOTES_BASE_URL` are all untouched.

```
today                                   after
──────────────────────────────          ──────────────────────────────
notes/*.json  tracked, 6 files          notes/   git-ignored
  ↑ kept in step by hand                  ↑ npm run notes:pull
  ↑ the de-facto backup                     s3api list-objects-v2
                                            s3api get-object

browser ──► pub-….r2.dev/notes.json    unchanged
```

## Why it is safe to delete them

R2 has no object versioning, so the question that matters is whether the repo
copies hold anything the bucket does not. They do not. A non-multipart R2
object's ETag is the MD5 of its body, and our notes are 7–19 KB single-part
puts, so the two are directly comparable — and today all six match:

```
notes/falling_behind_by_laufey.json              1d4fab49…  ==  ETag
notes/passionfruit_by_drake.json                 e63fcdb6…  ==  ETag
notes/pretty_isn_t_pretty_by_olivia_rodrigo.json 4741663a…  ==  ETag
notes/sold_out_dates_to_yosemite_by_gunna.json   640e2d8b…  ==  ETag
notes/tie_that_binds_by_drake.json               3bf97c40…  ==  ETag
notes/who_you_foolin_by_gunna.json               3bac7cab…  ==  ETag
```

That same comparison is what the rest of the design is built on: **an MD5 the
bucket hands us for free in a list call is enough to know whether a local copy
and a published note are the same bytes.** Nothing has to be remembered about
mtimes, and nothing depends on git.

## The three commands

`notes:pull` is new. `notes:publish` and `notes:unpublish` gain a guard, which
is the half of this change that earns the deletion: with no copy in git, the
irreversible operations have to refuse to run blind.

### `npm run notes:pull`

One `list-objects-v2` on the `notes/` prefix for keys and ETags, then
`get-object` for each key whose bytes we do not already have.

- A local file whose MD5 already equals the object's ETag is **not
  re-downloaded**. A second pull is therefore free and silent, which is what
  makes it reasonable to put in front of every publish.
- A key in the bucket with no local file is downloaded.
- **A local file with no key in the bucket is left alone** and reported as
  `local only — never published, or unpublished since`. Deleting it is the data
  loss this whole design exists to prevent, so pull never does it. `--prune`
  can be added later if the clutter ever bites.
- A pulled object that `fromJson` cannot open is still written, but warned
  about — the file is evidence either way, and refusing to save it would be the
  wrong instinct for a repair tool.
- `notes.json` is skipped. The manifest is derived; `notes:manifest` rebuilds
  it and nothing reads a local copy.

Afterwards it writes **`notes/.pulled.json`** — `{ slug: etag }` as of this
pull. That file is the ledger the guard reads, and it is the only new concept
in the design.

### The guard on `notes:publish`

Publishing over an existing note is the destructive case. The question the
guard asks is not "is my file newer" but **"has the bucket moved since I last
looked at it"**:

| Bucket state for this slug | Action |
|---|---|
| no such key | publish — nothing to lose |
| ETag == the ledger's entry | publish — the bucket is where we left it |
| ETag == the local file's MD5 | skip, report `unchanged` — the put would be a no-op |
| ETag differs from both | **refuse** |

```
$ npm run notes:publish -- notes/passionfruit_by_drake.json
refusing to publish:
  notes/passionfruit_by_drake.json: the copy in the bucket has changed
  since your last pull (bucket a91f…, last pulled e63f…). Run
  npm run notes:pull to see it, then publish again.
```

`--force` publishes anyway, for the case where you know the bucket holds
something you want gone. It has to be typed, which is the whole point.

A slug with no ledger entry at all — a fresh clone that has never pulled — is
treated as "the bucket has moved", because from the script's point of view it
has. The message says to pull.

### The guard on `notes:unpublish`

Deleting is final, so: **refuse unless a local file exists whose MD5 equals the
live object's ETag** — that is, unless you provably hold the bytes you are
about to destroy. Same `--force` escape hatch.

## Code changes

All in `scripts/notes.mjs` and the two docs. No `src/` change, so nothing in
the app or the build is affected.

| File | Change |
|---|---|
| `scripts/notes.mjs` | `pull()`; `bucketIndex()`; `readLedger()` / `writeLedger()`; the guards in `publish()` / `unpublish()`; `--force` in `parseArgs` |
| `package.json` | `"notes:pull": "node scripts/notes.mjs pull"` |
| `.gitignore` | `notes/` |
| `notes/*.json` | `git rm --cached` — six files leave the index, stay on disk |
| `README.md` | *Publishing notes* — pull before publishing; `notes/` is a working copy |
| `docs/notes-r2-storage.md` | drop "the copy in `notes/` is the backup"; point at pull |

Two helpers rather than three, per the repo's own habit of routing everything
through one function:

- **`bucketIndex(bucket)` replaces `listNotes(bucket)`.** The existing call
  already lists the prefix; adding `ETag` to its `--query` turns one request
  into the map that `pull`, both guards and `writeManifest` all want. One list
  call per command, as now.
- **`localMd5(file)`** — `createHash('md5')` over the bytes, in a scratch-free
  one-liner, used by pull, the guards and nothing else.

`readObject` already writes `get-object` output to a scratch file; `pull`
writes to `notes/<slug>.json` directly instead, so the existing shape is
reused rather than copied.

## Migration

The order matters only in that step 1 proves step 3 is safe.

```bash
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
export FRETBOOK_NOTES_BUCKET=fretbook-notes-dev

npm run notes:pull        # 1. writes notes/.pulled.json; downloads nothing
                          #    (all six already match) and says so
git rm --cached notes/*.json   # 2. out of the index, still on disk
                          # 3. commit .gitignore + the removal
```

Then the same `notes:pull` against `fretbook-notes-prod` once, to confirm the
two buckets agree — they were seeded from the same six files, so they should.

**The prod bucket is the one real risk in this change.** If dev and prod have
drifted, deleting the repo copies loses whichever side was not pulled. Step 1
run against both buckets, with a byte comparison, is what rules that out, and
it is worth doing before the commit rather than after.

## What this does not change

- The browser's read path, `VITE_NOTES_BASE_URL`, the public development URL,
  the CORS rule, the Docker build arg, the deploy workflows.
- `notes.json` remains rebuilt from the bucket by `writeManifest`, not edited.
- No new dependency. `md5` comes from `node:crypto`; everything else is the
  `aws` CLI the script already drives, with `s3api` and the same two checksum
  environment variables, for the same reasons.

## Rejected alternatives

- **An `archive/<slug>/<timestamp>.json` prefix in the bucket** — versioning by
  hand. It survives a lost laptop, which the ledger does not, but it makes the
  bucket hold things that are not notes, in a bucket where *public is a
  per-bucket switch with no per-prefix grant*. Every archived revision would be
  world-readable. Not worth it for six files.
- **mtime against `LastModified`** — simpler, and wrong often enough to be
  worse than nothing: a checkout, a copy or a touch moves mtime without moving
  bytes, and the guard would cry wolf until it was ignored.
- **Moving the runtime read path onto the S3 API** (private bucket, Flask
  proxying `get-object`) — a bigger, separate change. It would retire the
  public bucket, its CORS rule and the r2.dev rate limit, at the cost of
  putting the R2 token on the VPS and a server hop in front of every note.
  Worth revisiting if r2.dev's rate limit ever actually bites.

## Cost estimate

R2 is the only external paid service, and this change adds reads, not storage.

| Item | Free each month | Rate past it | Added by this change |
|---|---|---|---|
| Class A (list, write) | 1,000,000 | $4.50 / million | 1 list per command — tens a month |
| Class B (get, head) | 10,000,000 | $0.36 / million | ≤ 6 gets per *first* pull; 0 per repeat pull |
| Standard storage | 10 GB-month | $0.015 / GB-month | none |
| Egress | unlimited — R2 charges none | — | none |

**$0.00/month, unchanged.** The ETag-skip in pull is what keeps a
pull-before-every-publish habit from being a per-publish download of the whole
bucket; even without it the numbers would round to zero, but the silence is
worth more than the reads.

## Manual Setup Required From Owner

Nothing new in any console. The existing R2 token (**Object Read & Write**,
scoped to both buckets) already covers `ListObjectsV2` and `GetObject`, so
`notes:pull` works with the credentials you have.

Two things only you can do:

1. **Run `notes:pull` against `fretbook-notes-prod`** before the commit that
   untracks `notes/`, and confirm the six objects match the dev bucket and the
   repo. This is the one check that cannot be automated away, because it is the
   check that the thing being deleted is genuinely redundant.
2. **Decide where the off-laptop backup lives, if anywhere.** After this
   change, a lost laptop plus an unpublish is unrecoverable. Time Machine or
   any ordinary backup of the working tree covers it, since `notes/` is still a
   real folder on disk — it just is not in git. If that is not good enough, the
   archive-prefix alternative above is the thing to reach for.
