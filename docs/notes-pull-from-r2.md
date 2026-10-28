# The bucket is the source of truth

The bucket already decides what readers see — the browser reads
`pub-….r2.dev` directly and a deploy carries no notes
([docs/notes-r2-storage.md](notes-r2-storage.md)). The repo has not caught up:
six JSON files under `notes/` are tracked in git and kept in step by hand,
documented as "local copies, not the source of truth" while in practice being
treated as the backup of anything published.

This refactor makes the documented position the real one.

- **The bucket is the only place a note lives.** Nothing else is authoritative.
- **No note is tracked in git.** The six that are get removed, and a check
  keeps new ones out rather than trusting `.gitignore` and good intentions.
- **`notes/` becomes a cache of the bucket**, refreshed by a new
  `npm run notes:pull`, which **mirrors** — it deletes local files the bucket
  no longer has, because a file the bucket does not have is not a note.

The runtime read path, the public bucket, the CORS rule and
`VITE_NOTES_BASE_URL` are untouched.

```
today                                   after
──────────────────────────────          ──────────────────────────────
notes/*.json  tracked, 6 files          notes/   git-ignored cache
  ↑ kept in step by hand                  ↑ npm run notes:pull  (mirror)
  ↑ the de-facto backup                     s3api list-objects-v2
                                            s3api get-object

browser ──► pub-….r2.dev/notes.json    unchanged
```

## Deleting the tracked files loses nothing

A non-multipart R2 object's ETag is the MD5 of its body, and these notes are
7–19 KB single-part puts, so the two are directly comparable. Today all six
tracked files match their objects exactly:

```
notes/falling_behind_by_laufey.json              1d4fab49…  ==  ETag
notes/passionfruit_by_drake.json                 e63fcdb6…  ==  ETag
notes/pretty_isn_t_pretty_by_olivia_rodrigo.json 4741663a…  ==  ETag
notes/sold_out_dates_to_yosemite_by_gunna.json   640e2d8b…  ==  ETag
notes/tie_that_binds_by_drake.json               3bf97c40…  ==  ETag
notes/who_you_foolin_by_gunna.json               3bac7cab…  ==  ETag
```

The repo holds no byte the bucket does not. That same free MD5 — `ETag` costs
nothing extra on a list call — is also what lets `pull` skip a download it does
not need.

## `npm run notes:pull`

One `list-objects-v2` on the `notes/` prefix for keys and ETags, then
`get-object` per key, and the local folder ends up equal to the bucket:

| Bucket | Local | Result |
|---|---|---|
| key exists | MD5 == ETag | nothing — already have these bytes |
| key exists | differs, or absent | downloaded |
| no key | file exists | **deleted** |

- **A repeat pull downloads nothing and is silent.** The ETag skip is what
  makes that true, and it is why pulling can be a reflex rather than a decision.
- **`notes/` holds nothing but the bucket's contents.** An export you have not
  published yet does not belong there — it lives wherever the browser saved it,
  and `notes:publish` takes any path, so there is no reason to stage it in the
  cache. This is what lets pull mirror without a prompt.
- A pulled object that `fromJson` cannot open is still written, but warned
  about. The file is evidence either way, and a repair tool that hides a broken
  note is the wrong instinct.
- `notes.json` is skipped. The manifest is derived; `notes:manifest` rebuilds it
  from the bucket and nothing reads a local copy.

There is no ledger and no state file. The bucket is asked every time, which is
the whole premise.

## `publish` and `unpublish` are unchanged

They already treat the bucket as authoritative, and under this design there is
no local copy whose survival they have to defend. So neither grows a guard:
publishing over a note replaces it, unpublishing deletes it, both on one press.

One small thing worth taking from the same list call: a file whose MD5 already
equals the live object's ETag is **skipped with `unchanged`** rather than
re-uploaded. That is an avoided no-op, not a safety rail. If every file in a
publish is skipped, the manifest is left alone too — rebuilding it reads every
note in the bucket, which is not a cost to pay for a run that changed nothing,
and `notes:manifest` still forces it.

**R2 has no object versioning, so both remain final** — and with nothing in git
there is no second copy to restore from. That is the accepted cost of a single
source of truth, stated here so it is a decision rather than a surprise. The
mitigation, if it ever bites, is in *Rejected alternatives*.

## Keeping notes out of git

`.gitignore` stops an accidental `git add`; it does nothing about a file already
tracked, which is exactly the state the repo is in today. So the invariant gets
a check of its own:

```bash
npm run notes:check     # node scripts/notes.mjs check
```

It fails when `git ls-files notes/` returns anything, naming the files and the
`git rm --cached` that fixes it. Two lines of `execFileSync`, no network, no
credentials — so it is cheap enough to run in CI on both `dev` and `main`,
which is where it earns its place: the failure it catches is someone adding a
note back months from now, and that is not a thing a person remembers to look
for.

## Code changes

All in `scripts/notes.mjs` and the two docs. No `src/` change, so nothing in
the app or the build is affected.

| File | Change |
|---|---|
| `scripts/notes.mjs` | `pull()`, `check()`; `listNotes()` → `bucketIndex()`; `localMd5()`; the `unchanged` skip in `publish()` |
| `package.json` | `notes:pull`, `notes:check` |
| `.gitignore` | `notes/` |
| `notes/*.json` | `git rm --cached` — six files leave the index |
| `.github/workflows/` | `npm run notes:check` on `dev` and `main` |
| `README.md` | *Publishing notes* — pull refreshes the cache; the bucket is the only copy |
| `docs/notes-r2-storage.md` | drop "the copy in `notes/` is the backup" |

Two helpers, per the repo's habit of routing everything through one function:

- **`bucketIndex(bucket)` replaces `listNotes(bucket)`.** The existing call
  already lists the prefix; adding `ETag` to its `--query` turns one request
  into the map that `pull`, the `unchanged` skip and `writeManifest` all want.
  One list call per command, as now.
- **`localMd5(file)`** — `createHash('md5')` over the bytes, used by `pull` and
  the skip.

`readObject` already writes `get-object` output to a scratch file; `pull`
writes to `notes/<slug>.json` directly, reusing the shape rather than copying
it.

## Migration

```bash
export AWS_PROFILE=r2
export FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com

FRETBOOK_NOTES_BUCKET=fretbook-notes-dev npm run notes:pull   # downloads nothing
git rm --cached notes/*.json
# commit: .gitignore, the removal, the CI step
```

The pull is first only so it prints the comparison; it will report all six as
already-held. `git rm --cached` keeps the files on disk, where they are now the
correct cache contents — though a plain `git rm` would be just as safe, since
`notes:pull` puts them back.

**Check `fretbook-notes-prod` too, once, before the commit.** Both buckets were
seeded from the same six files and should agree; if they have drifted, the
drift is real published content and this is the moment to see it. After the
commit there is nowhere else to look.

## What this does not change

- The browser's read path, `VITE_NOTES_BASE_URL`, the public development URL,
  the CORS rule, the Docker build arg, the deploy workflows.
- `notes.json` stays rebuilt from the bucket by `writeManifest`, never edited.
- No new dependency. `md5` is `node:crypto`; the rest is the `aws` CLI the
  script already drives, with `s3api` and the same two checksum environment
  variables, for the same reasons.

## Rejected alternatives

- **An ETag ledger (`notes/.pulled.json`) with publish and unpublish refusing
  when the bucket has moved since the last pull.** This was the previous draft
  of this doc. It only makes sense if the local copy is a backup worth
  defending; once the bucket is the source of truth, it is a toggle protecting
  a cache, and it would make the common case — republish a note you just
  edited — ask permission.
- **An `archive/<slug>/<timestamp>.json` prefix in the same bucket.** The
  obvious answer to R2 having no versioning, and still wrong here: *public is a
  per-bucket switch with no per-prefix grant*, so every archived revision would
  be world-readable alongside the notes.
- **A second, private bucket for archives.** This is the one to reach for if
  the finality above ever actually costs something — it keeps the archive out of
  the public bucket, and `notes:publish` would copy the outgoing object into it
  before overwriting. Left out now because it doubles the buckets to reason
  about for a risk that is six small files.
- **Moving the runtime read path onto the S3 API** (private bucket, Flask
  proxying `get-object`) — a bigger, separate change. It retires the public
  bucket, its CORS rule and the r2.dev rate limit, at the cost of the R2 token
  on the VPS and a server hop in front of every note. Worth revisiting if
  r2.dev's rate limit ever bites.

## Cost estimate

R2 is the only external paid service, and this change adds reads, not storage.

| Item | Free each month | Rate past it | Added by this change |
|---|---|---|---|
| Class A (list, write) | 1,000,000 | $4.50 / million | 1 list per command — tens a month |
| Class B (get, head) | 10,000,000 | $0.36 / million | ≤ 6 gets on a cold pull; 0 on a repeat |
| Standard storage | 10 GB-month | $0.015 / GB-month | none |
| Egress | unlimited — R2 charges none | — | none |

**$0.00/month, unchanged.** `notes:check` is free — it is a git command.

## Manual Setup Required From Owner

Nothing new in any console. The existing R2 token (**Object Read & Write**,
scoped to both buckets) already covers `ListObjectsV2` and `GetObject`, so
`notes:pull` works with the credentials you have.

One thing only you can do: **run `notes:pull` against `fretbook-notes-prod`
before the commit that untracks `notes/`**, and confirm it reports the six
objects as already-held rather than downloading or deleting anything. That is
the check that the two buckets agree and that nothing is lost by deleting the
tracked copies, and it cannot be automated away, because it is the check that
the automation is safe.
