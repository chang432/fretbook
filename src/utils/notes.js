/**
 * Where the published notes come from.
 *
 * They live in a public Cloudflare R2 bucket — one per environment — and the
 * browser reads them straight out of it, so nothing about a note passes
 * through the site's own server. The bucket holds the same two things the
 * built site used to:
 *
 *   notes.json            the manifest /notes lists
 *   notes/<name>.json     one note, the editor's own JSON export
 *
 * Notes sit under a prefix and the manifest does not, so no note is barred
 * from being called "notes".
 *
 * The bucket's URL is baked in at build time (`VITE_NOTES_BASE_URL`), which is
 * what makes dev and prod read different buckets from the same source: each
 * environment's image is built with its own value. See docs/notes-r2-storage.md
 * for how the bucket is made public and its CORS rule, and README's
 * *Publishing notes* for how a note gets into it.
 */
import { fromJson } from './tab.js'

/**
 * The bucket, without its trailing slash. Empty when the build was given no
 * bucket — a local `npm run dev` without an .env.local, say — which the pages
 * below report as such rather than fetching a nonsense URL.
 */
const BASE = (import.meta.env.VITE_NOTES_BASE_URL ?? '').trim().replace(/\/+$/, '')

/** Whether this build knows where the notes are. */
export const notesConfigured = BASE !== ''

/** The manifest the index page lists. */
export const manifestUrl = () => `${BASE}/notes.json`

/** The raw JSON behind one note — the file as it sits in the bucket. */
export const noteUrl = (slug) => `${BASE}/notes/${slug}.json`

/**
 * The published notes, as `{ slug, title }` in the order the index shows them.
 * Anything unreadable — no manifest yet, a network error, a bucket answering
 * with something that is not a list — is an empty shelf rather than an error:
 * the page says nothing is published, which is what the reader needs to know.
 */
export async function fetchManifest() {
  if (!notesConfigured) return []
  try {
    // no-store, not the default: the manifest changes whenever a note is
    // published, and a cached copy would hide the new one until it expired.
    const response = await fetch(manifestUrl(), { cache: 'no-store' })
    if (!response.ok) return []
    const list = await response.json()
    return Array.isArray(list) ? list.filter((note) => note?.slug) : []
  } catch {
    return []
  }
}

/**
 * One note, parsed, or null if there is nothing publishable at that name. The
 * parse is the test rather than the status code: a bucket can answer a missing
 * key with its own XML error document, and an object that is not an export the
 * editor can open is just as missing from a reader's point of view.
 */
export async function fetchNote(slug) {
  if (!notesConfigured) return null
  try {
    const response = await fetch(noteUrl(slug))
    if (!response.ok) return null
    return fromJson(await response.text())
  } catch {
    return null
  }
}
