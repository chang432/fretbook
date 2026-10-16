#!/usr/bin/env node
/**
 * Publishing, as a command.
 *
 * The published notes live in a public S3 bucket — one per environment — and
 * that bucket is the source of truth: publishing is this script, not a commit,
 * and a deploy neither carries notes nor can lose them. The layout it writes
 * is the one src/utils/notes.js reads:
 *
 *   notes.json            the manifest /notes lists
 *   notes/<name>.json     one note, the editor's own JSON export
 *
 *   npm run notes:publish   -- --bucket fretbook-notes-dev notes/*.json
 *   npm run notes:unpublish -- --bucket fretbook-notes-dev passionfruit_by_drake
 *   npm run notes:manifest  -- --bucket fretbook-notes-dev
 *
 * The bucket can also come from FRETBOOK_NOTES_BUCKET, which is the easier way
 * to avoid publishing to the wrong environment by muscle memory. Credentials
 * are the AWS CLI's own (`aws configure`, or the usual environment variables);
 * nothing here reads or stores one.
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

/** Nothing here takes long enough to want a partial result. */
const aws = (...args) =>
  execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

const die = (message) => {
  console.error(message)
  process.exit(1)
}

/** `--bucket x` / `--bucket=x` out of the arguments, leaving the rest. */
function parseArgs(argv) {
  const rest = []
  let bucket = process.env.FRETBOOK_NOTES_BUCKET ?? ''

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--bucket') {
      bucket = argv[i + 1] ?? ''
      i += 1
    } else if (arg.startsWith('--bucket=')) {
      bucket = arg.slice('--bucket='.length)
    } else {
      rest.push(arg)
    }
  }

  return { bucket: bucket.trim(), rest }
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

/** Every note key in the bucket, in whatever order S3 hands them over. */
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

/**
 * Rewrite the manifest from the bucket's own contents. Every note is read back
 * for its title, which is a handful of small GETs and means a note uploaded by
 * hand, outside this script, still ends up listed.
 */
function writeManifest(bucket) {
  const notes = []

  for (const key of listNotes(bucket)) {
    const slug = key.slice(`${PREFIX}/`.length, -'.json'.length)
    if (!NOTE_NAME.test(slug)) {
      console.warn(`  skipping ${key}: not a publishable name`)
      continue
    }

    // `-` is the CLI's stdout, so the object never touches the disk.
    const sheet = fromJson(aws('s3', 'cp', `s3://${bucket}/${key}`, '-'))
    if (!sheet) {
      console.warn(`  skipping ${key}: not an export the editor can open`)
      continue
    }

    notes.push({ slug, title: sheet.title || slug })
  }

  // Listed the way the index page shows them, so the order is decided once.
  notes.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))

  const file = join(mkdtempSync(join(tmpdir(), 'fretbook-notes-')), MANIFEST)
  writeFileSync(file, `${JSON.stringify(notes, null, 2)}\n`)

  // no-cache, unlike the notes themselves: this is the one object that has to
  // reflect a publish immediately, and it is two lines per note.
  aws(
    's3',
    'cp',
    file,
    `s3://${bucket}/${MANIFEST}`,
    '--content-type',
    'application/json',
    '--cache-control',
    'no-cache',
  )

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
    aws(
      's3',
      'cp',
      file,
      `s3://${bucket}/${PREFIX}/${slug}.json`,
      '--content-type',
      'application/json',
      // Short rather than immutable: a note can be republished under the same
      // name, and a minute of staleness is cheaper than never caching at all.
      '--cache-control',
      'public, max-age=60',
    )
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
    aws('s3', 'rm', `s3://${bucket}/${PREFIX}/${slug}.json`)
    console.log(`Unpublished /notes/${slug}`)
  }

  writeManifest(bucket)
}

const [command, ...argv] = process.argv.slice(2)
const { bucket, rest } = parseArgs(argv)

if (!bucket) {
  die('No bucket. Pass --bucket <name>, or set FRETBOOK_NOTES_BUCKET.')
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
