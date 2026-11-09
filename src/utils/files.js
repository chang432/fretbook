/**
 * Names and files: what a sheet is called when it leaves the editor.
 *
 * None of this knows anything about tab. It is here so that the sheet model
 * can be about the music and nothing else, and so that the two addresses a
 * name has to satisfy — a file on disk and a path in the bucket — are
 * settled in the one place.
 */

/**
 * What a published note may be called: lowercase letters and digits in runs,
 * joined by a single hyphen or underscore. The two marks are interchangeable
 * so that a JSON export's own stem, which `slugify` joins with underscores,
 * is publishable as it comes.
 */
export const NOTE_NAME = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

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
