#!/usr/bin/env node
/**
 * Publishing, as a command.
 *
 * The published notes live in a private Cloudflare R2 bucket — one per
 * environment — and **that bucket is the only place a note lives**. Nothing in
 * this repo is authoritative about one: publishing is this script, not a
 * commit, and a deploy neither carries notes nor can lose them. The layout it
 * writes is the one docker/app/backend/app/notes.py serves to the app:
 *
 *   notes.json            the manifest /notes lists
 *   notes/<name>.json     one note, the editor's own JSON export
 *
 *   npm run notes:publish   -- notes/*.json
 *   npm run notes:unpublish -- passionfruit_by_drake
 *   npm run notes:manifest
 *   npm run notes:pull
 *
 * **A bare command means the dev bucket.** Local work is dev work, so that is
 * the default, and production has to be asked for by name — the mistake worth
 * making hard is the one that cannot be taken back, and nothing here can be.
 * Every command prints the bucket it acted on, so a forgotten override is
 * visible in the first line of output rather than in the consequences.
 *
 * The local `notes/` folder is a **cache of the bucket**, not a copy worth
 * keeping: it is git-ignored, and `pull` mirrors it onto whatever the bucket
 * holds. An export you have not published yet does not belong there — publish
 * it from wherever the browser saved it, since `publish` takes any path.
 *
 * R2 speaks the S3 API, so this drives the ordinary AWS CLI pointed at the
 * account's R2 endpoint (`--endpoint`, or FRETBOOK_R2_ENDPOINT — see
 * docs/notes-r2-storage.md for where the endpoint and its credentials come
 * from). The bucket can likewise come from FRETBOOK_NOTES_BUCKET, to point a
 * whole shell at production without repeating `--bucket`.
 *
 * Both are read out of **.env.local** when it is there, which is the same
 * git-ignored file Vite reads VITE_API_PROXY from — so one file is all the
 * local setup there is, and a shell variable still wins over it when you want
 * one command to go somewhere else. Credentials are the CLI's own; nothing
 * here reads or stores one.
 *
 * Two things the build used to do are done here instead, because this is now
 * the only moment a note is looked at:
 *
 *   - a note the editor could not open is refused, so a reader never meets a
 *     broken one;
 *   - the manifest is rebuilt from what is actually in the bucket afterwards,
 *     rather than edited, so it cannot drift from the notes it lists.
 *
 * R2 has no object versioning, so a republish and an unpublish are both final,
 * and with nothing in git there is no second copy to restore from. That is the
 * accepted cost of one source of truth — see docs/notes-pull-from-r2.md.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// The parser the app itself imports notes with, so what passes here is exactly
// what will open in the editor.
import { NOTE_NAME, fromJson } from '../src/utils/tab.js'

/** Prefix the notes sit under, leaving the manifest's name free for a note. */
const PREFIX = 'notes'

/** The manifest's key in the bucket. */
const MANIFEST = 'notes.json'

/** The repo, found from this file rather than from the caller's cwd. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The cache `pull` mirrors the bucket into. Named after the bucket's prefix. */
const NOTES_DIR = join(ROOT, PREFIX)

/** What a command means when it is not told otherwise. See the header. */
const DEFAULT_BUCKET = 'fretbook-notes-dev'

// The same .env.local Vite reads, so the endpoint and a bucket override can be
// written down once instead of exported into every shell. It does not overwrite
// a variable that is already set, which is the precedence we want: a flag beats
// a shell variable beats this file beats the default. Guarded only because the
// file is optional.
const ENV_FILE = join(ROOT, '.env.local')
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE)
}

/**
 * Every call is a single small object, so this uses the low-level `s3api`
 * commands rather than `aws s3 cp`. `cp` goes through the CLI's transfer
 * manager, which adds checksum headers of its own choosing — a thing R2 and
 * the CLI have disagreed about before, and a disagreement that surfaces as an
 * opaque "unsupported header" rather than as anything to do with notes.
 * `s3api` sends exactly the request written here.
 *
 * The endpoint and region go in right after the operation, so a command's own
 * positional argument — get-object's output file — stays where it reads
 * naturally, at the end.
 *
 * The two checksum variables say the same thing to a CLI new enough to read
 * them, and are ignored by one that is not.
 */
const aws = (group, operation, ...args) =>
  execFileSync('aws', [group, operation, '--endpoint-url', endpoint, '--region', 'auto', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
      AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required',
    },
  })

const die = (message) => {
  console.error(message)
  process.exit(1)
}

/**
 * A local file's MD5, which is directly comparable to an R2 ETag: these notes
 * are a few KB and go up as a single part, and a non-multipart object's ETag is
 * the MD5 of its body. That equivalence is what lets `pull` skip a download and
 * `publish` skip a no-op upload, without either of them keeping any state.
 */
const localMd5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex')

/** `--bucket x` / `--endpoint x` out of the arguments, leaving the rest. */
function parseArgs(argv) {
  const rest = []
  const flags = {
    bucket: process.env.FRETBOOK_NOTES_BUCKET ?? '',
    endpoint: process.env.FRETBOOK_R2_ENDPOINT ?? '',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const named = Object.keys(flags).find((name) => arg === `--${name}`)
    const inline = Object.keys(flags).find((name) => arg.startsWith(`--${name}=`))

    if (named) {
      flags[named] = argv[i + 1] ?? ''
      i += 1
    } else if (inline) {
      flags[inline] = arg.slice(`--${inline}=`.length)
    } else {
      rest.push(arg)
    }
  }

  return { bucket: flags.bucket.trim(), endpoint: flags.endpoint.trim(), rest }
}

/**
 * The slug a local file would publish under, or null with a reason. The name
 * is the URL, so it is checked here rather than after the upload.
 */
function slugOf(file) {
  const name = basename(file)
  if (!name.endsWith('.json')) return { error: `${file}: not a .json file` }

  const slug = name.slice(0, -'.json'.length)
  if (!NOTE_NAME.test(slug)) {
    // Said in words as well as in the pattern: the rule is about word
    // separators rather than about a character set.
    return {
      error:
        `${file}: a note's name is its URL — lowercase letters and digits, ` +
        `joined by single dashes or underscores (${NOTE_NAME.source})`,
    }
  }

  return { slug }
}

/** A scratch directory for the objects this reads back and the file it writes. */
const scratch = () => mkdtempSync(join(tmpdir(), 'fretbook-notes-'))

/**
 * Every note in the bucket as `key → md5`, in one request. The ETag rides along
 * on the listing for free, and it is the answer to every "do I already have
 * these bytes" question below — which is why this is one function rather than a
 * listing plus a head-object per note.
 */
function bucketIndex(bucket) {
  const output = aws(
    's3api',
    'list-objects-v2',
    '--bucket',
    bucket,
    '--prefix',
    `${PREFIX}/`,
    '--query',
    `Contents[].{Key:Key,ETag:ETag}`,
    '--output',
    'json',
  )

  const rows = JSON.parse(output || 'null')
  const index = new Map()
  if (!Array.isArray(rows)) return index

  for (const { Key: key, ETag: etag } of rows) {
    // The ETag arrives quoted, as the S3 API sends it; strip them once here so
    // no caller has to remember.
    if (key?.endsWith('.json')) index.set(key, (etag ?? '').replaceAll('"', ''))
  }

  return index
}

/** One object's body. get-object writes it to a file, so it lands in `dir`. */
function readObject(bucket, key, dir) {
  const file = join(dir, 'object.json')
  // Its own JSON report goes to stdout and is of no interest; the body is the
  // file.
  aws('s3api', 'get-object', '--bucket', bucket, '--key', key, file)
  return readFileSync(file, 'utf8')
}

function putObject(bucket, key, file, cacheControl) {
  aws(
    's3api',
    'put-object',
    '--bucket',
    bucket,
    '--key',
    key,
    '--body',
    file,
    '--content-type',
    'application/json',
    '--cache-control',
    cacheControl,
  )
}

/** The slug a note's key stands for, or null if that key is not a note's. */
function slugOfKey(key) {
  const slug = key.slice(`${PREFIX}/`.length, -'.json'.length)
  return NOTE_NAME.test(slug) ? slug : null
}

/**
 * Rewrite the manifest from the bucket's own contents. Every note is read back
 * for its title, which is a handful of small reads and means a note uploaded
 * by hand, outside this script, still ends up listed.
 */
function writeManifest(bucket) {
  const dir = scratch()
  const notes = []

  for (const key of bucketIndex(bucket).keys()) {
    const slug = slugOfKey(key)
    if (!slug) {
      console.warn(`  skipping ${key}: not a publishable name`)
      continue
    }

    const sheet = fromJson(readObject(bucket, key, dir))
    if (!sheet) {
      console.warn(`  skipping ${key}: not an export the editor can open`)
      continue
    }

    notes.push({ slug, title: sheet.title || slug })
  }

  // Listed the way the index page shows them, so the order is decided once.
  notes.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))

  const file = join(dir, MANIFEST)
  writeFileSync(file, `${JSON.stringify(notes, null, 2)}\n`)

  // no-cache, unlike the notes themselves: this is the one object that has to
  // reflect a publish immediately, and it is two lines per note.
  putObject(bucket, MANIFEST, file, 'no-cache')

  console.log(`Manifest: ${notes.length} note${notes.length === 1 ? '' : 's'}.`)
  return notes
}

/**
 * Bring the local cache to exactly what the bucket holds: fetch what we do not
 * have, delete what the bucket no longer does. A file the bucket does not have
 * is not a note, so mirroring is the whole point rather than an option — the
 * bucket is the source of truth, and this folder is a view of it.
 *
 * A second pull in a row fetches nothing and says so, which is what makes it
 * reasonable to run before reaching for `publish`.
 */
function pull(bucket) {
  const index = bucketIndex(bucket)
  mkdirSync(NOTES_DIR, { recursive: true })

  const wanted = new Set()
  let fetched = 0
  let held = 0

  for (const [key, etag] of index) {
    const slug = slugOfKey(key)
    if (!slug) {
      console.warn(`  skipping ${key}: not a publishable name`)
      continue
    }

    const name = `${slug}.json`
    const file = join(NOTES_DIR, name)
    wanted.add(name)

    if (existsSync(file) && localMd5(file) === etag) {
      held += 1
      continue
    }

    aws('s3api', 'get-object', '--bucket', bucket, '--key', key, file)
    fetched += 1
    console.log(`  fetched ${name}`)

    // Written either way: a note the editor cannot open is still the thing the
    // bucket is serving readers, and seeing it is the point of pulling.
    if (!fromJson(readFileSync(file, 'utf8'))) {
      console.warn(`  warning: ${name} is not an export the editor can open`)
    }
  }

  // Dotfiles are left alone: nothing here writes one, so one that exists is
  // somebody's, and deleting it is not this command's business.
  const removed = readdirSync(NOTES_DIR).filter(
    (name) => name.endsWith('.json') && !name.startsWith('.') && !wanted.has(name),
  )

  for (const name of removed) {
    rmSync(join(NOTES_DIR, name))
    console.log(`  removed ${name} — not in the bucket`)
  }

  const counts = [
    `${fetched} fetched`,
    `${held} already held`,
    `${removed.length} removed`,
  ].join(', ')
  console.log(`${PREFIX}/ mirrors ${bucket}: ${counts}.`)
}

function publish(bucket, files) {
  if (files.length === 0) die('Nothing to publish. Pass one or more exported .json files.')

  // Validated as a set before anything is uploaded, so a bad file in a
  // wildcard does not leave half of it published.
  const uploads = []
  const errors = []
  for (const file of files) {
    const { slug, error } = slugOf(file)
    if (error) {
      errors.push(error)
      continue
    }

    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      errors.push(`${file}: cannot be read`)
      continue
    }

    if (!fromJson(text)) {
      errors.push(`${file}: not a Fretboard Notebook export the editor can open`)
      continue
    }

    uploads.push({ file, slug })
  }

  if (errors.length) die(`Refusing to publish:\n  ${errors.join('\n  ')}`)

  // One listing answers "is this already what the bucket is serving" for the
  // whole set. Skipping a byte-identical upload is an avoided no-op, not a
  // safety rail: a publish that would change something always goes through.
  const index = bucketIndex(bucket)
  let published = 0

  for (const { file, slug } of uploads) {
    const key = `${PREFIX}/${slug}.json`
    if (index.get(key) === localMd5(file)) {
      console.log(`Unchanged /notes/${slug}`)
      continue
    }

    // Short rather than immutable: a note can be republished under the same
    // name, and a minute of staleness is cheaper than never caching at all.
    putObject(bucket, key, file, 'public, max-age=60')
    console.log(`Published /notes/${slug}`)
    published += 1
  }

  // Nothing moved, so the manifest cannot have gone stale on our account —
  // and rebuilding it reads every note in the bucket, which is not a cost to
  // pay for a no-op. `notes:manifest` is still there to force it.
  if (published === 0) {
    console.log('Nothing changed; leaving the manifest alone.')
    return
  }

  writeManifest(bucket)
}

function unpublish(bucket, slugs) {
  if (slugs.length === 0) die('Nothing to unpublish. Pass one or more note names.')

  for (const slug of slugs) {
    // Names, not paths: a note is named by its slug everywhere else, and
    // accepting notes/x.json here would invite notes/notes/x.json.
    if (!NOTE_NAME.test(slug)) die(`${slug} is not a note name (${NOTE_NAME.source})`)
  }

  for (const slug of slugs) {
    // R2 keeps no versions and nothing is tracked in git, so this is final.
    aws('s3api', 'delete-object', '--bucket', bucket, '--key', `${PREFIX}/${slug}.json`)
    console.log(`Unpublished /notes/${slug}`)
  }

  writeManifest(bucket)
}

const [command, ...argv] = process.argv.slice(2)
const { bucket: asked, endpoint, rest } = parseArgs(argv)

const bucket = asked || DEFAULT_BUCKET

if (!endpoint) {
  die(
    'No R2 endpoint. Pass --endpoint https://<account id>.r2.cloudflarestorage.com, ' +
      'set FRETBOOK_R2_ENDPOINT, or write it into .env.local.',
  )
}

// First line of every run. Naming the bucket unprompted is what makes the
// default safe to have: there is no quiet difference between the command that
// touches dev and the one that touches production.
console.log(`Bucket: ${bucket}${asked ? '' : ' (default)'}`)

switch (command) {
  case 'publish':
    publish(bucket, rest)
    break
  case 'unpublish':
    unpublish(bucket, rest)
    break
  case 'manifest':
    writeManifest(bucket)
    break
  case 'pull':
    pull(bucket)
    break
  default:
    die(
      `Usage: node scripts/notes.mjs <publish|unpublish|manifest|pull> ` +
        `--bucket <name> [args]`,
    )
}
