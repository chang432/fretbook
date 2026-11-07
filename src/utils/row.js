import { Column } from './column.js'

/**
 * One row of the sheet: its own run of positions, however many that is.
 *
 * A row's length is its own. Nothing divides it — there are no bars — and
 * no row needs to know how long the rows above it were, because a position
 * is named by its row and where it stands in that row rather than by any
 * sheet-wide number.
 *
 * `length` and `columns.length` are the same number, kept so by the only
 * two things that make a row: this constructor, and `withCell` below, which
 * rebuilds the row around one changed column rather than editing it.
 */
export class Row {
  /**
   * @param {number}   length    how many positions this row holds
   * @param {Column[]} [columns] the positions themselves; empty when not given
   */
  constructor(length, columns = null) {
    this.length = length
    this.columns = columns ?? Array.from({ length }, (_, at) => new Column(at))
  }

  /** The position standing at `col`. */
  column(col) {
    return this.columns[col]
  }

  /** True when nothing is written anywhere in this row. */
  get isEmpty() {
    return this.columns.every((column) => column.isEmpty)
  }

  /**
   * This row with something else written in one of its cells, or `this` when
   * that comes to nothing new. A position off either end of the row is no
   * write at all.
   */
  withCell(col, string, value) {
    if (col < 0 || col >= this.columns.length) return this

    const column = this.columns[col]
    const written = column.withCell(string, value)
    if (written === column) return this

    return new Row(
      this.length,
      this.columns.map((each, c) => (c === col ? written : each)),
    )
  }
}
