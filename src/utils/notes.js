/**
 * Where the published notes come from.
 *
 * They live in a **private** Cloudflare R2 bucket — one per environment — and
 * the app reads them from its own origin, through the backend, which is the one
 * thing holding a credential for that bucket. A browser cannot sign an S3
 * request, so this is what lets the bucket stop being public: see
 * docs/notes-via-s3-client.md, and docker/app/backend/app/notes.py for the end
 * that speaks S3.
 *
 *   GET /api/notes          the manifest /notes lists, as [{ slug, title }]
 *   GET /api/notes/<slug>   one note, the editor's own JSON export
 *
 * Same origin, so there is no CORS rule, no bucket URL to inline at build time,
 * and no difference between the dev and prod bundles. Under `npm run dev` the
 * Vite dev server proxies /api to the compose stack — see vite.config.js.
 */
import { fromJson } from './tab.js'

/** The manifest the index page lists. */
export const manifestUrl = () => '/api/notes'

/** The raw JSON behind one note — the file as it sits in the bucket. */
export const noteUrl = (slug) => `/api/notes/${slug}`

/**
 * The published notes, as `{ slug, title }` in the order the index shows them.
 * Anything unreadable — a backend that is down, a bucket it cannot reach, an
 * answer that is not a list — is an empty shelf rather than an error: the page
 * says nothing is published, which is what the reader needs to know.
 */
export async function fetchManifest() {
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
 * parse is still the test rather than the status code: an object that is not an
 * export the editor can open is just as missing from a reader's point of view,
 * and the backend only judges it as far as being JSON at all.
 */
export async function fetchNote(slug) {
  try {
    const response = await fetch(noteUrl(slug))
    if (!response.ok) return null
    return fromJson(await response.text())
  } catch {
    return null
  }
}
