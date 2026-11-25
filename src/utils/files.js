/**
 * Names and files: what a sheet is called when it leaves the editor.
 *
 * None of this knows anything about tab. It is here so that the sheet model
 * can be about the music and nothing else, and so that the two addresses a
 * name has to satisfy — a file on disk and a path in the bucket — are
 * settled in the one place.
 */

/** New sheet names use lowercase letters and digits separated by underscores. */
export const NOTE_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

/** The most characters a sheet's title can hold. */
export const TITLE_LIMIT = 40

/**
 * A sheet's title has two forms. On screen, while it is typed and read, it is
 * lowercase letters, digits and spaces. Written out — exported, saved, kept
 * in the browser — the spaces become underscores. These three convert between
 * them, so nothing else has to.
 */

/**
 * A title as it is typed: lowercased, accents taken off letters (é → e), and
 * anything but letters, digits and spaces dropped.
 */
export const typeSheetName = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')

/** A title read back from a file, a save or the browser, for the screen. */
export const readSheetName = (stored) =>
  typeSheetName(String(stored ?? '').replace(/_/g, ' ')).slice(0, TITLE_LIMIT)

/** A title as it is written out: trimmed, each run of spaces one underscore. */
export const writeSheetName = (title) => title.trim().replace(/ +/g, '_')

/** Existing saved sheets may have been published with hyphens. */
export const SAVED_NOTE_NAME = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/

/**
 * Filesystem-safe file stem from the sheet's title. A run of anything that
 * is not a letter or a digit collapses to one underscore and the ends are
 * trimmed, so what comes back always satisfies `NOTE_NAME`.
 */
export const slugify = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'fretboard_notebook'

/** Trigger a browser download for generated text or a rendered blob. */
export function downloadFile(filename, data, mime = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
