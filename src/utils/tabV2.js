/**
 * The second editor's model: a sheet, and the one way to write in it.
 *
 * A sheet is a list of rows, and each of the three things under it is a
 * class of its own:
 *
 *   sheet   →  [ Row, Row, … ]
 *   Row     →  length, and its own run of columns
 *   Column  →  rowPosition, cssMode, and six cells
 *   Cell    →  string, value
 *
 * A group is marked inside the staff rather than around it: the position it
 * starts at, the position it ends at, and the one past that saying how many
 * times it is played are columns of the row like any other, given over to
 * saying so. `cssMode` is how a column says which it is, `repeat` is the
 * count the last of the three carries, and a column that says any of this
 * is still a column — it holds its six cells and takes up its place in the
 * run. None of the three is a position to write in.
 *
 * Each knows only what is under it: a cell knows its string, a column knows
 * where it stands in its row, and only the sheet — this file — knows which
 * row is which. So a row can be read on its own, and a position is named by
 * its row and where it stands in it rather than by any sheet-wide number.
 *
 * What is *not* here is the point of it. There is no flat grid to slice a
 * row out of, and there are no bars, so no length is a count of fours.
 *
 * utils/tab.js is the first editor's model and stays that way: the two are
 * deliberately unconnected, so this one can be changed without reading the
 * whole of the other. Nothing V2 touches imports from there.
 */
export { Cell, STRING_COUNT, MAX_FRET } from './cell.js'
export {
  Column,
  DEFAULT_GROUP_NAME,
  GROUP_START,
  GROUP_END,
  GROUP_REPEAT,
  normalizeGroupName,
  normalizeRepeat,
} from './column.js'
export { Row } from './row.js'

/** Top-to-bottom string labels in standard tuning. */
export const STANDARD_TUNING = ['e', 'B', 'G', 'D', 'A', 'E']

/**
 * Write one cell, and hand back the sheet that results.
 *
 * Nothing is changed in place. The row, the column and the cell on the way
 * down to the one being written are each rebuilt, and everything else is
 * the object it already was — so a sheet held in state can be compared by
 * identity, at any level, to see what an edit actually touched.
 *
 * A write that comes to nothing — a row or position that does not exist, a
 * string that is not on the instrument, or a value the cell already holds —
 * hands back the very sheet it was given. Each class decides that for
 * itself and says so by returning `this`; this only passes the answer on.
 */
export function writeCell(sheet, row, col, string, value) {
  const standing = sheet[row]
  if (!standing) return sheet

  const written = standing.withCell(col, string, value)
  if (written === standing) return sheet

  return sheet.map((each, r) => (r === row ? written : each))
}

/**
 * Give one column over to marking a group edge, or hand it back to being a
 * plain position with `false`. Rebuilds exactly as little as `writeCell`
 * does, and hands back the same sheet when the column is already drawn that
 * way or there is no such column to mark.
 */
export function markColumn(sheet, row, col, cssMode, marks = {}) {
  const standing = sheet[row]
  if (!standing) return sheet

  const marked = standing.withMode(col, cssMode, marks)
  if (marked === standing) return sheet

  return sheet.map((each, r) => (r === row ? marked : each))
}
