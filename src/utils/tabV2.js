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
 * starts at and the position it ends at are columns of the row like any
 * other, given over to saying so. `cssMode` is how a column says which it
 * is, `repeat` is the count the closing one carries, and a column that says
 * any of this is still a column — it holds its six cells and takes up its
 * place in the run. Neither is a position to write in.
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
import { DEFAULT_GROUP_NAME, GROUP_START } from './column.js'

export {
  Column,
  DEFAULT_GROUP_NAME,
  GROUP_START,
  GROUP_END,
  GROUP_REF,
  GROUP_REF_END,
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

/**
 * Every group written anywhere on the sheet, each saying which row it is
 * in — what there is to choose from when one is to be played somewhere
 * else. A column standing in for a group is not itself one: only the
 * places a group is actually written count.
 */
export const sheetGroups = (sheet) =>
  sheet.flatMap((row, at) => row.groups.map((group) => ({ ...group, row: at })))

/**
 * Change how many times the group marked at `col` is played. The count is
 * written on the column that closes a group, whether that is a group of
 * this row's own or one played here from elsewhere, so this keeps the
 * column as it is and changes only the count on it.
 */
export function setRepeat(sheet, row, col, repeat) {
  const standing = sheet[row]
  const column = standing?.column(col)
  if (!column || column.repeat === null) return sheet

  const marked = standing.withMode(col, column.cssMode, { ...column.marks, repeat })
  if (marked === standing) return sheet

  return sheet.map((each, r) => (r === row ? marked : each))
}

/**
 * Rename the group that opens at `col`, everywhere it is read.
 *
 * A group is named on the column that opens it, and every column standing
 * in for that group elsewhere carries the name too — that is all a place
 * where a group is played knows about which group it is. So renaming one
 * is a sheet-wide edit: the group itself, and each place it is played, or
 * those places would go on calling it by a name nothing answers to.
 *
 * Which means two groups called the same letter are, to this, one group.
 * The name is the whole of the link between them.
 */
export function nameGroup(sheet, row, col, name) {
  const standing = sheet[row]
  const opening = standing?.column(col)
  if (!opening || opening.cssMode !== GROUP_START) return sheet

  const before = opening.name ?? DEFAULT_GROUP_NAME
  const named = standing.withMode(col, GROUP_START, { name })
  if (named === standing) return sheet

  return sheet.map((each, r) => (r === row ? named : each).withRefsRenamed(before, name))
}

/**
 * Take the group that opens at `col` off the sheet: its two ends and its
 * count, and with them every place it was played, since a group played
 * somewhere is only ever a pointer back to the one written here.
 *
 * The notes inside it stay. The columns are the group; what is written
 * between them is the music, and it is still the music once it is played
 * the once.
 */
export function deleteGroup(sheet, row, col) {
  const standing = sheet[row]
  const opening = standing?.column(col)
  if (!opening || opening.cssMode !== GROUP_START) return sheet

  const name = opening.name ?? DEFAULT_GROUP_NAME

  return sheet.map((each, r) =>
    (r === row ? each.withoutGroupAt(col) : each).withoutRefsNamed(name),
  )
}

/**
 * Take one place a group was played off the sheet. The group itself is
 * untouched — this is the pointer going, not the thing pointed at — and
 * the row goes back to the length it was before the group was put down.
 */
export function deleteRef(sheet, row, col) {
  const standing = sheet[row]
  if (!standing) return sheet

  const cut = standing.withoutRefAt(col)
  if (cut === standing) return sheet

  return sheet.map((each, r) => (r === row ? cut : each))
}

/**
 * Put a group down at a position: that column becomes the whole group,
 * said in one place, with a column for its count beside it. The row grows
 * by one, since the count needs somewhere to stand that was not there
 * before.
 *
 * Whatever was written in the column is gone. It is not a loss to work
 * around: a column saying a group is played here is not a position, so
 * there is nothing in it for a note to be written on.
 */
export function placeGroup(sheet, row, col, name) {
  const standing = sheet[row]
  if (!standing) return sheet

  const placed = standing.withGroupAt(col, name)
  if (placed === standing) return sheet

  return sheet.map((each, r) => (r === row ? placed : each))
}
