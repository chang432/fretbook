import { SAVED_NOTE_NAME } from './files.js'

export const sheetPath = (slug) => `/sheets/${slug}`
export const publicSheetPath = (slug) => `/sheets/public/${slug}`

const nameFrom = (pattern, pathname) => {
  const match = pattern.exec(pathname)
  return match && SAVED_NOTE_NAME.test(match[1]) ? match[1] : null
}

/** Match only valid saved-sheet names; all other paths open the draft. */
export const sheetSlug = (pathname) => nameFrom(/^\/sheets\/([^/]+)\/?$/, pathname)

/** A public sheet anyone can open: /sheets/public/<name>. */
export const publicSheetSlug = (pathname) => nameFrom(/^\/sheets\/public\/([^/]+)\/?$/, pathname)

/** Leave modified and non-primary clicks to the browser. */
export function followSheetLink(event, navigate, slug) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(slug)
}
