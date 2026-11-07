/**
 * The second editor's model, and all of it.
 *
 * A sheet is a list of rows. A row is its own run of positions, and a
 * position is the six strings sounding at once:
 *
 *   sheet  →  [ row, row, … ]
 *   row    →  [ column, column, … ]      one entry per position
 *   column →  ['', '3', '', '', '', '0'] one entry per string, top to bottom
 *
 * A cell holds a fret number, 'x' for a muted string, or '' for nothing.
 *
 * What is *not* here is the point of the file. There is no flat sheet-wide
 * grid, so nothing has to be sliced out of one and no row needs to know
 * where the rows above it ended. There are no bars, so no length is a count
 * of fours. A position is named by its row and where it stands in that row,
 * which is the only way the editor ever addresses one.
 *
 * utils/tab.js is the first editor's model and stays that way: the two are
 * deliberately unconnected, so this one can be changed without reading the
 * whole of the other. Nothing V2 touches imports from there.
 */

/** Strings on the instrument, and so cells in a position. */
export const STRING_COUNT = 6

/** Top-to-bottom string labels in standard tuning. */
export const STANDARD_TUNING = ['e', 'B', 'G', 'D', 'A', 'E']

/** Highest fret accepted in a cell. */
export const MAX_FRET = 24

/** One position: every string silent. */
export const createColumn = () => Array(STRING_COUNT).fill('')

/** A row of `positions` empty positions. */
export const createRow = (positions) => Array.from({ length: positions }, createColumn)

/**
 * Restrict a cell to what can sit on a tab line: a fret number (0-24) or a
 * muted-string marker. Anything else is dropped as it is typed.
 */
export function normalizeCell(raw) {
  const cleaned = String(raw).trim().toLowerCase()
  if (cleaned === '') return ''
  if (cleaned.endsWith('x')) return 'x'

  const digits = cleaned.replace(/\D/g, '')
  if (digits === '') return ''

  // Typing a 3rd digit shifts the cell left ("12" + "3" -> "23") instead of
  // being swallowed, so a mistyped fret can be corrected without clearing.
  const twoDigits = digits.slice(-2)
  const value = Number(twoDigits)
  return value <= MAX_FRET ? String(value) : twoDigits.slice(-1)
}

/**
 * Write one cell, and hand back the sheet that results.
 *
 * The sheet is never changed in place: the row, the position and the cell on
 * the way down to the one being written are rebuilt, and everything else is
 * the same array it was. A write that changes nothing — a position that does
 * not exist, or a cell that already holds this — hands back the very sheet it
 * was given, so a caller holding it in state can tell that nothing happened.
 */
export function writeCell(sheet, row, col, string, value) {
  const columns = sheet[row]
  if (!columns || col < 0 || col >= columns.length) return sheet
  if (string < 0 || string >= STRING_COUNT) return sheet
  if (columns[col][string] === value) return sheet

  return sheet.map((current, r) =>
    r === row
      ? current.map((column, c) =>
          c === col ? column.map((cell, s) => (s === string ? value : cell)) : column,
        )
      : current,
  )
}
