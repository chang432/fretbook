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
 *   GET    /api/notes          the manifest /notes lists, as [{ slug, title }]
 *   GET    /api/notes/<slug>   one note, the editor's own JSON export
 *   PUT    /api/notes/<slug>   publish the sheet in the body under that name
 *   POST   /api/notes/<slug>   replace that note — password required
 *   DELETE /api/notes/<slug>   take that note down — password required
 *
 * Same origin, so there is no CORS rule, no bucket URL to inline at build time,
 * and no difference between the dev and prod bundles. Under `npm run dev` the
 * Vite dev server proxies /api to the compose stack — see vite.config.js.
 */
import { fromJson } from './tab.js'
import { notePath } from './route.js'

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

/**
 * Publish one sheet as a new note at `/notes/<slug>`. Refused if that name is
 * already a note: see `updateNote` for the other half of that.
 *
 * The same hop in the other direction: the browser cannot sign an S3 request,
 * so the backend is what writes the object — see docker/app/backend/app/notes.py
 * for what it accepts, and docs/notes-upload-from-app.md for why a taken name
 * is refused rather than overwritten.
 */
export async function publishNote(slug, json) {
  return write('PUT', slug, json)
}

/**
 * Write one sheet over the note already at `/notes/<slug>`.
 *
 * Final: R2 keeps no versions, and the note that was there is the only copy
 * there was. Hence the password, which the backend holds as
 * FRETBOOK_PUBLISH_PASSWORD and this end never stores — it is typed for the
 * press that uses it and goes no further than the one request.
 */
export async function updateNote(slug, json, password) {
  return write('POST', slug, json, { 'X-Fretbook-Password': password })
}

/**
 * Take the note at `/notes/<slug>` down.
 *
 * As final as `updateNote`, and the same password: the object it removes was
 * the only copy of that note there was. Re-publishing it is `notes:publish`
 * from whatever the browser saved, which is not nothing but is not this page.
 */
export async function deleteNote(slug, password) {
  return write('DELETE', slug, null, { 'X-Fretbook-Password': password })
}

/**
 * One write to the bucket, through the backend. `json` is null for the write
 * that sends nothing.
 *
 * Resolves to `{ ok: true, note }`, or `{ ok: false, error }` with something
 * worth putting in front of the reader. A name that is taken is the one
 * failure the caller acts on rather than just reports, so it says so with
 * `taken` instead of only in words.
 */
async function write(method, slug, json, headers = {}) {
  const sending = json !== null

  let response
  try {
    response = await fetch(noteUrl(slug), {
      method,
      headers: sending ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: sending ? json : undefined,
    })
  } catch {
    // Offline, or nothing answering the origin at all.
    return { ok: false, error: 'Could not reach the server' }
  }

  if (response.ok) {
    try {
      return { ok: true, note: await response.json() }
    } catch {
      // Published — the status says so — but the body is not what this end
      // expects. The note is live either way, so it is not reported as a
      // failure that would invite a second upload of the same sheet.
      return { ok: true, note: { slug, path: notePath(slug) } }
    }
  }

  // The backend's own wording when there is one: it knows which of the several
  // ways a publish can be refused this was — a name that cannot be a URL and a
  // sheet that is not an export are both 400s to a status code, and different
  // things to say. It writes API prose, lowercase; this is where it is read
  // aloud.
  let said = ''
  try {
    said = (await response.json())?.error ?? ''
  } catch {
    said = ''
  }

  return {
    ok: false,
    taken: response.status === 409,
    wrongPassword: response.status === 401,
    error: sentence(said) || FAILURES[response.status] || 'That did not go through',
  }
}

/** A message as a sentence, whatever case it arrived in. */
const sentence = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : '')

/** A last resort for a status that arrived without a body to explain it. */
const FAILURES = {
  400: 'That sheet is not something the editor could open again',
  401: 'That password is not right',
  404: 'There is no note at that name',
  409: 'That name is taken',
  413: 'That sheet is too large to publish',
  429: 'Too many notes published just now — try again shortly',
  503: 'Publishing is not set up on this site',
}
