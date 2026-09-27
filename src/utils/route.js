/**
 * The three addresses the site answers on. Small enough to do by hand: there
 * is no nesting, no parameters beyond a note's name, and nothing to match
 * against that a regex does not already say.
 *
 *   /                 the editor — one sheet, kept in this browser
 *   /notes            the published notes, listed
 *   /notes/<name>     one published note, read from /notes/<name>.json
 *
 * The server serves index.html for all three (see docker/app/caddy/Caddyfile),
 * so a deep link and a press inside the app arrive at the same place.
 */
import { useEffect, useState } from 'react'
import { NOTE_NAME } from './tab.js'

/** Where the published notes are listed. */
export const NOTES_PATH = '/notes'

/** The path a note is read at, and the link that opens it. */
export const notePath = (slug) => `${NOTES_PATH}/${slug}`

/** The JSON behind it — the file as it sits on the server. */
export const noteFile = (slug) => `${NOTES_PATH}/${slug}.json`

/** The manifest the index page lists. Written by vite-plugin-notes.js. */
export const NOTES_MANIFEST = '/notes.json'

/**
 * What a path asks for. Anything unrecognised is the editor rather than a
 * not-found page: the editor is the site, and a stale or mistyped link is
 * better answered with it than with an apology.
 */
export function readRoute(pathname = window.location.pathname) {
  // Trailing slashes are the same address; '/notes/' lists, it does not ask
  // for a note called ''.
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === NOTES_PATH) return { name: 'index' }

  if (path.startsWith(`${NOTES_PATH}/`)) {
    const slug = decodeURIComponent(path.slice(NOTES_PATH.length + 1))
    // Checked before it is ever put back into a URL, so a name cannot climb
    // out of the folder it is meant to name.
    if (NOTE_NAME.test(slug)) return { name: 'note', slug }
  }

  return { name: 'editor' }
}

/**
 * Go somewhere without reloading. pushState does not tell anyone, so the
 * event the back button would have raised is raised here too and the one
 * listener below covers both.
 */
export function navigate(path) {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** The current route, kept up to date through the back and forward buttons. */
export function useRoute() {
  const [route, setRoute] = useState(() => readRoute())

  useEffect(() => {
    const onPopState = () => setRoute(readRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return route
}
