import { STRING_COUNT, emptyCell } from './cell.js'

/**
 * What a column can be drawn as, past a plain position.
 *
 * A group is marked inside the staff rather than around it: its first and
 * last positions are columns of the row like any other, given over to
 * saying where the group begins and ends. These are what `cssMode` holds.
 */
export const GROUP_START = 'group-start'
export const GROUP_END = 'group-end'

/**
 * The column just past the closing one, which says how many times the group
 * is played. It belongs to the group and is not a position to write in; its
 * count is the column's `repeat`.
 */
export const GROUP_REPEAT = 'group-repeat'

/**
 * One position of one row: the six strings sounding at once.
 *
 * A column knows where it stands in its row and what is written across it.
 * It does not know which row that is — the row knows that — so a column can
 * be read and reasoned about on its own.
 *
 * Writing goes through `withCell`, which builds the column that results
 * rather than editing this one, and hands back `this` when the write
 * changes nothing. The sheet is rebuilt the same way all the way up, so an
 * edit that came to nothing can be recognised by identity at any level.
 */
export class Column {
  /**
   * @param {number}  rowPosition where this stands in its row, counted from 0
   * @param {Cell[]}  [cells]     the six strings; empty ones when not given
   * @param {string|false} [cssMode] GROUP_START, GROUP_END, GROUP_REPEAT, or
   *   false for a plain position — how the column is drawn, and nothing
   *   more. A column marking a group is still a column: it holds its six
   *   cells and takes up its position like any other.
   * @param {number|null} [repeat] how many times the group is played, on a
   *   GROUP_REPEAT column and nowhere else.
   */
  constructor(rowPosition, cells = null, cssMode = false, repeat = null) {
    this.rowPosition = rowPosition
    this.cssMode = cssMode
    this.repeat = repeat
    this.cells = cells ?? Array.from({ length: STRING_COUNT }, (_, string) => emptyCell(string))
  }

  /** What is written on one string here. */
  cell(string) {
    return this.cells[string]
  }

  /** True when nothing is written across this position at all. */
  get isEmpty() {
    return this.cells.every((cell) => cell.isEmpty)
  }

  /** True when this column is one end of a group rather than a plain position. */
  get isGroupEdge() {
    return this.cssMode === GROUP_START || this.cssMode === GROUP_END
  }

  /** True when this column belongs to a group rather than standing on its own. */
  get isGroupMark() {
    return this.cssMode !== false
  }

  /**
   * This column drawn another way, or `this` when it is drawn that way
   * already. The count rides along with the mode, since it is only ever
   * read on a repeat column.
   */
  withMode(cssMode, repeat = null) {
    if (cssMode === this.cssMode && repeat === this.repeat) return this
    return new Column(this.rowPosition, this.cells, cssMode, repeat)
  }

  /**
   * This column with something else written on one of its strings, or
   * `this` when that comes to nothing new. A string that does not exist is
   * no write at all.
   */
  withCell(string, value) {
    if (string < 0 || string >= STRING_COUNT) return this

    const cell = this.cells[string]
    const written = cell.with(value)
    if (written === cell) return this

    return new Column(
      this.rowPosition,
      this.cells.map((each, s) => (s === string ? written : each)),
      this.cssMode,
      this.repeat,
    )
  }
}
