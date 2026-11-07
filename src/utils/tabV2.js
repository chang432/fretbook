import { EMPTY } from './cell.js'

/**
 * The second editor's model: where every cell stands.
 *
 * A sheet is a list of rows. A row is its own run of positions, and a
 * position is the six strings sounding at once:
 *
 *   sheet  →  [ row, row, … ]
 *   row    →  [ column, column, … ]   one entry per position
 *   column →  [ Cell, Cell, … ]       one per string, top to bottom
 *
 * What a cell is, and what it will accept, is utils/cell.js's business.
 * This file only ever holds cells and puts new ones in place.
 *
 * What is *not* here is the point of it. There is no flat sheet-wide grid,
 * so nothing has to be sliced out of one and no row needs to know where the
 * rows above it ended. There are no bars, so no length is a count of fours.
 * A position is named by its row and where it stands in that row, which is
 * the only way the editor ever addresses one.
 *
 * utils/tab.js is the first editor's model and stays that way: the two are
 * deliberately unconnected, so this one can be changed without reading the
 * whole of the other. Nothing V2 touches imports from there.
 */

/** Strings on the instrument, and so cells in a position. */
export const STRING_COUNT = 6

/** Top-to-bottom string labels in standard tuning. */
export const STANDARD_TUNING = ['e', 'B', 'G', 'D', 'A', 'E']

/** One position: every string silent. The empty cell is shared — it is frozen. */
export const createColumn = () => Array(STRING_COUNT).fill(EMPTY)

/** A row of `positions` empty positions. */
export const createRow = (positions) => Array.from({ length: positions }, createColumn)

/**
 * Write one cell, and hand back the sheet that results.
 *
 * The sheet is never changed in place: the row, the position and the cell on
 * the way down to the one being written are rebuilt, and everything else is
 * the same array it was. A write that changes nothing — a position that does
 * not exist, or a cell the value comes to nothing new in — hands back the
 * very sheet it was given, so a caller holding it in state can tell that
 * nothing happened. The cell itself decides that last part: `with` returns
 * the cell unchanged when there is no new value in what it is handed.
 */
export function writeCell(sheet, row, col, string, value) {
  const columns = sheet[row]
  if (!columns || col < 0 || col >= columns.length) return sheet
  if (string < 0 || string >= STRING_COUNT) return sheet

  const cell = columns[col][string]
  const written = cell.with(value)
  if (written === cell) return sheet

  return sheet.map((current, r) =>
    r === row
      ? current.map((column, c) =>
          c === col ? column.map((each, s) => (s === string ? written : each)) : column,
        )
      : current,
  )
}
