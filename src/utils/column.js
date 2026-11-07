import { STRING_COUNT, emptyCell } from './cell.js'

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
   * @param {number} rowPosition where this stands in its row, counted from 0
   * @param {Cell[]} [cells]     the six strings; empty ones when not given
   */
  constructor(rowPosition, cells = null) {
    this.rowPosition = rowPosition

    /**
     * Nothing reads this yet. It is here to be the switch for a column drawn
     * differently from its neighbours — the one the string does not run
     * through — once there is something to decide that.
     */
    this.cssMode = false

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

    const next = new Column(
      this.rowPosition,
      this.cells.map((each, s) => (s === string ? written : each)),
    )
    next.cssMode = this.cssMode
    return next
  }
}
