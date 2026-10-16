#!/usr/bin/env node
/**
 * Publishing, as a command.
 *
 * The published notes live in a public Cloudflare R2 bucket — one per
 * environment — and that bucket is the source of truth: publishing is this
 * script, not a commit, and a deploy neither carries notes nor can lose them.
 * The layout it writes is the one src/utils/notes.js reads:
 *
 *   notes.json            the manifest /notes lists
 *   notes/<name>.json     one note, the editor's own JSON export
 *
 *   npm run notes:publish   -- --bucket fretbook-notes-dev notes/*.json
 *   npm run notes:unpublish -- --bucket fretbook-notes-dev passionfruit_by_drake
 *   npm run notes:manifest  -- --bucket fretbook-notes-dev
 *
 * R2 speaks the S3 API, so this drives the ordinary AWS CLI pointed at the
 * account's R2 endpoint (`--endpoint`, or FRETBOOK_R2_ENDPOINT — see
 * docs/notes-r2-storage.md for where the endpoint and its credentials come
 * from). The bucket can likewise come from FRETBOOK_NOTES_BUCKET, which is the
 * easier way to avoid publishing to the wrong environment by muscle memory.
 * Credentials are the CLI's own; nothing here reads or stores one.
 *
 * Two things the build used to do are done here instead, because this is now
 * the only moment a note is looked at:
 *
 *   - a note the editor could not open is refused, so a reader never meets a
 *     broken one;
 *   - the manifest is rebuilt from what is actually in the bucket afterwards,
 *     rather than edited, so it cannot drift from the notes it lists.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

// The parser the app itself imports notes with, so what passes here is exactly
// what will open in the editor.
import { NOTE_NAME, fromJson } from '../src/utils/tab.js'

/** Prefix the notes sit under, leaving the manifest's name free for a note. */
const PREFIX = 'notes'

/** The manifest's key in the bucket. */
const MANIFEST = 'notes.json'

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

/** Every note key in the bucket, in whatever order R2 hands them over. */
function listNotes(bucket) {
  const output = aws(
    's3api',
    'list-objects-v2',
    '--bucket',
    bucket,
    '--prefix',
    `${PREFIX}/`,
    '--query',
    'Contents[].Key',
    '--output',
    'json',
  )
  const keys = JSON.parse(output || 'null')
  return Array.isArray(keys) ? keys.filter((key) => key.endsWith('.json')) : []
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

/**
 * Rewrite the manifest from the bucket's own contents. Every note is read back
 * for its title, which is a handful of small reads and means a note uploaded
 * by hand, outside this script, still ends up listed.
 */
function writeManifest(bucket) {
  const dir = scratch()
  const notes = []

  for (const key of listNotes(bucket)) {
    const slug = key.slice(`${PREFIX}/`.length, -'.json'.length)
    if (!NOTE_NAME.test(slug)) {
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

  for (const { file, slug } of uploads) {
    // Short rather than immutable: a note can be republished under the same
    // name, and a minute of staleness is cheaper than never caching at all.
    putObject(bucket, `${PREFIX}/${slug}.json`, file, 'public, max-age=60')
    console.log(`Published /notes/${slug}`)
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
    // R2 keeps no versions, so this is final — which is why the repo holds a
    // local copy of everything that has been published.
    aws('s3api', 'delete-object', '--bucket', bucket, '--key', `${PREFIX}/${slug}.json`)
    console.log(`Unpublished /notes/${slug}`)
  }

  writeManifest(bucket)
}

const [command, ...argv] = process.argv.slice(2)
const { bucket, endpoint, rest } = parseArgs(argv)

if (!bucket) {
  die('No bucket. Pass --bucket <name>, or set FRETBOOK_NOTES_BUCKET.')
}

if (!endpoint) {
  die(
    'No R2 endpoint. Pass --endpoint https://<account id>.r2.cloudflarestorage.com, ' +
      'or set FRETBOOK_R2_ENDPOINT.',
  )
}

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
  default:
    die(`Usage: node scripts/notes.mjs <publish|unpublish|manifest> --bucket <name> [args]`)
}
