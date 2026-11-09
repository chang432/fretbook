import { SAVED_NOTE_NAME } from './files.js'

export const sheetPath = (slug) => `/sheets/${slug}`

/** Match only valid saved-sheet names; all other paths open the draft. */
export function sheetSlug(pathname) {
  const match = /^\/sheets\/([^/]+)\/?$/.exec(pathname)
  return match && SAVED_NOTE_NAME.test(match[1]) ? match[1] : null
}

/** Leave modified and non-primary clicks to the browser. */
export function followSheetLink(event, navigate, slug) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(slug)
}
