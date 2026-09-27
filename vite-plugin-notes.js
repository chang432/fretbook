/**
 * Published notes — the tabs that ship with the site.
 *
 * A note is a Fretboard Notebook JSON export sitting in `public/notes/`, and
 * its file name is its URL: `public/notes/wonderwall.json` is served verbatim
 * at `/notes/wonderwall.json` and read by the app at `/notes/wonderwall`. Vite
 * copies `public/` into `dist/` on its own, so this plugin only does the three
 * things it cannot:
 *
 *   - refuses to build a folder holding a note the app could not open, so a
 *     bad file is caught in CI rather than by a reader;
 *   - writes `notes.json`, the manifest the index page lists;
 *   - answers `/notes.json` during `vite dev`, where nothing is built.
 *
 * The manifest is `notes.json` at the site root rather than
 * `notes/index.json`, so no note is barred from being called "index".
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// The parser the app itself imports notes with, so what passes here is exactly
// what will open in the editor. Pure ESM — nothing in it touches the DOM at
// module scope — so it is safe to pull into a config file.
import { NOTE_NAME, fromJson } from './src/utils/tab.js'

/** Where the notes live, relative to the Vite root. */
const NOTES_DIR = 'public/notes'

/** The manifest's path in the built site. */
const MANIFEST = 'notes.json'

/**
 * Every publishable note in `dir`, with whatever is wrong with the rest.
 * Errors are collected rather than thrown so one build reports the whole
 * folder instead of the first file that fails.
 */
function readNotes(dir) {
  const notes = []
  const errors = []
  const warnings = []

  let files
  try {
    files = readdirSync(dir).sort()
  } catch {
    // No folder yet is not a failure: the site simply publishes nothing.
    return { notes, errors, warnings }
  }

  for (const file of files) {
    // .DS_Store and friends are the filesystem's business, not the site's.
    if (file.startsWith('.')) continue
    if (!file.endsWith('.json')) {
      warnings.push(`${file} is not a .json file and will not be published`)
      continue
    }

    const slug = file.slice(0, -'.json'.length)
    if (!NOTE_NAME.test(slug)) {
      // Said in words as well as in the pattern: this is read by whoever
      // dropped the file in, and the rule is about word separators rather
      // than about a character set.
      errors.push(
        `${file}: a note's name is its URL — lowercase letters and digits, ` +
          `joined by single dashes or underscores (${NOTE_NAME.source})`,
      )
      continue
    }

    const sheet = fromJson(readFileSync(join(dir, file), 'utf8'))
    if (!sheet) {
      errors.push(`${file}: not a Fretboard Notebook export the editor can open`)
      continue
    }

    notes.push({ slug, title: sheet.title || slug })
  }

  // Listed the way the index page shows them, so the order is decided once.
  notes.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
  return { notes, errors, warnings }
}

export default function notesPlugin() {
  let dir = NOTES_DIR
  let building = false

  return {
    name: 'fretbook-notes',

    configResolved(config) {
      dir = join(config.root, NOTES_DIR)
      building = config.command === 'build'
    },

    buildStart() {
      const { notes, errors, warnings } = readNotes(dir)
      warnings.forEach((message) => this.warn(message))

      if (errors.length) {
        // Fails `npm run build`, which the deploy workflow runs before it
        // touches the VPS.
        this.error(`Cannot publish ${NOTES_DIR}:\n  ${errors.join('\n  ')}`)
      }

      // Nothing is emitted while the dev server runs; the middleware below is
      // what answers there.
      if (building) {
        this.emitFile({
          type: 'asset',
          fileName: MANIFEST,
          source: `${JSON.stringify(notes, null, 2)}\n`,
        })
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${MANIFEST}`) return next()

        // Re-read per request rather than caching: a note dropped into the
        // folder should show up on the next refresh, without a restart.
        const { notes, errors } = readNotes(dir)
        errors.forEach((message) => server.config.logger.warn(`[notes] ${message}`))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(notes))
      })
    },
  }
}
