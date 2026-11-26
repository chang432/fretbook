/** Private sheet requests go through the Flask backend with a Clerk session token. */
import { fromJson } from './sheet.js'

const noteUrl = (slug) => `/api/sheets/${slug}`

async function authHeaders(getToken) {
  const token = await getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchManifest(getToken) {
  const response = await fetch('/api/sheets', { cache: 'no-store', headers: await authHeaders(getToken) })
  if (!response.ok) throw new Error('Could not load your saved sheets')
  const list = await response.json()
  if (!Array.isArray(list)) throw new Error('Could not load your saved sheets')
  return list.filter((note) => note?.slug)
}

export const fetchNote = (slug, getToken) => readSheet(noteUrl(slug), () => authHeaders(getToken))

/** Public sheets need no session token. */
export const fetchPublicNote = (slug) => readSheet(`/api/sheets/public/${slug}`, async () => ({}))

/** The sheet at `url`, or null when it can't be fetched or parsed. */
async function readSheet(url, headers) {
  try {
    const response = await fetch(url, { cache: 'no-store', headers: await headers() })
    if (!response.ok) return null
    return fromJson(await response.text())
  } catch {
    return null
  }
}

export const publishNote = (slug, json, getToken) => write('PUT', slug, json, getToken)
export const updateNote = (slug, json, getToken) => write('POST', slug, json, getToken)
export const deleteNote = (slug, getToken) => write('DELETE', slug, null, getToken)

async function write(method, slug, json, getToken) {
  let response
  try {
    const headers = await authHeaders(getToken)
    response = await fetch(noteUrl(slug), {
      method,
      headers: json !== null ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: json ?? undefined,
    })
  } catch {
    return { ok: false, error: 'Could not reach the server' }
  }
  if (response.ok) return { ok: true, note: await response.json() }
  let body = null
  try { body = await response.json() } catch { /* Use the fallback below. */ }
  const error = body?.error ?? ''
  return {
    ok: false,
    taken: response.status === 409,
    // A free account already holds as many sheets as its plan allows.
    limit: body?.code === 'sheet_limit',
    error: error ? `${error[0].toUpperCase()}${error.slice(1)}` : 'That did not go through',
  }
}
