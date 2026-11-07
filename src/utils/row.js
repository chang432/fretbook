import { Column, DEFAULT_GROUP_NAME, GROUP_END, GROUP_REPEAT, GROUP_START } from './column.js'

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
   * The columns given over to saying where a group begins and ends, in the
   * order they stand. A group is marked inside the staff, so these are the
   * row's own columns rather than anything laid over it.
   */
  get groupEdges() {
    return this.columns.filter((column) => column.isGroupEdge)
  }

  /**
   * The groups this row holds, read back out of the columns that mark
   * them: an opening column, the closing one after it, and what the two of
   * them say. A group that was opened and never closed is not one yet, so
   * it is left out rather than guessed at.
   *
   * The count is read from the column past the closing one, where it is
   * written, and the name off the opening one — so a group that has never
   * been named still has one to show.
   */
  get groups() {
    const found = []
    let open = null

    this.columns.forEach((column) => {
      if (column.cssMode === GROUP_START) {
        open = column
        return
      }
      if (column.cssMode !== GROUP_END || !open) return

      const past = this.columns[column.rowPosition + 1]
      found.push({
        start: open.rowPosition,
        end: column.rowPosition,
        name: open.name ?? DEFAULT_GROUP_NAME,
        repeat: past?.cssMode === GROUP_REPEAT ? past.repeat : null,
        repeatAt: past?.cssMode === GROUP_REPEAT ? past.rowPosition : null,
      })
      open = null
    })

    return found
  }

  /** The group this position falls inside, counting its own two ends, or null. */
  groupAt(col) {
    return this.groups.find(({ start, end }) => col >= start && col <= end) ?? null
  }

  /**
   * This row with one of its columns drawn another way, or `this` when it is
   * drawn that way already. A position off either end is no change at all.
   */
  withMode(col, cssMode, marks = {}) {
    if (col < 0 || col >= this.columns.length) return this

    const column = this.columns[col]
    const marked = column.withMode(cssMode, marks)
    if (marked === column) return this

    return new Row(
      this.length,
      this.columns.map((each, c) => (c === col ? marked : each)),
    )
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
