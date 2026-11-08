import {
  Column,
  DEFAULT_GROUP_NAME,
  GROUP_END,
  GROUP_REF,
  GROUP_START,
} from './column.js'

/**
 * The row that is left when some of its columns are taken out of it: the
 * ones that stay, renumbered so the run has no gap in it, and a length to
 * match. Everything that shortens a row goes through here, which is what
 * keeps `length` and the positions themselves honest.
 */
function without(row, gone) {
  if (gone.size === 0) return row

  const kept = row.columns
    .filter((column) => !gone.has(column.rowPosition))
    .map((column, at) => column.at(at))

  return new Row(kept.length, kept, row.name)
}

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
   * @param {string}   [name]    what the row is called, written down its
   *   side. A row with nothing to say is called nothing, which is not the
   *   same as being unnamed: there is simply no name to write.
   */
  constructor(length, columns = null, name = '') {
    this.length = length
    this.name = name
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
   * The count is read off the closing column, where it is written, and the
   * name off the opening one — so a group that has never been named still
   * has one to show.
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

      found.push({
        start: open.rowPosition,
        end: column.rowPosition,
        name: open.name ?? DEFAULT_GROUP_NAME,
        repeat: column.repeat,
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
      this.name,
    )
  }

  /**
   * This row with a group put down at `col`: that one column becomes the
   * whole group, carrying its name and a count of one to begin with.
   *
   * Whatever stood there is gone — a column saying a group is played here
   * is not a position, so there is nowhere in it for a note to be — but
   * the row is the length it was. A group played here takes the place of a
   * position rather than being squeezed in beside it, so nothing else
   * moves.
   */
  withGroupAt(col, name) {
    if (col < 0 || col >= this.columns.length) return this

    const placed = new Column(col, null, GROUP_REF, { name, repeat: 1 })

    return new Row(
      this.length,
      this.columns.map((column, c) => (c === col ? placed : column)),
      this.name,
    )
  }

  /**
   * This row without the group that opens at `col`: both of its ends are
   * gone, and the row is two positions shorter.
   *
   * What was written *inside* the group stays. The two columns are the
   * group — they are what say a run of positions is played again — and the
   * notes between them are the music, which is nobody's to throw away here.
   */
  withoutGroupAt(col) {
    const group = this.groups.find((each) => each.start === col)
    if (!group) return this

    return without(this, new Set([group.start, group.end]))
  }

  /**
   * This row without the group that was played at `col`: that column goes
   * back to being a plain position, empty — exactly undoing `withGroupAt`,
   * the row's length included, which never changed.
   */
  withoutRefAt(col) {
    const standing = this.columns[col]
    if (!standing?.isGroupRef) return this

    return new Row(
      this.length,
      this.columns.map((column, c) => (c === col ? new Column(col) : column)),
      this.name,
    )
  }

  /**
   * This row without any of the places a named group was played. Taken from
   * the right, so that each position still to be removed is where it was
   * when they were all counted.
   */
  withoutRefsNamed(name) {
    const refs = this.columns.filter((column) => column.isGroupRef && column.name === name)
    return refs.reduceRight((row, ref) => row.withoutRefAt(ref.rowPosition), this)
  }

  /**
   * This row with every place a group was played under one name now saying
   * another — what a group being renamed means everywhere it is played.
   */
  withRefsRenamed(from, to) {
    if (from === to) return this

    let found = false
    const columns = this.columns.map((column) => {
      if (!column.isGroupRef || column.name !== from) return column
      found = true
      // Everything else the column says rides along: a group being renamed
      // is no reason for it to stop being played as many times as it was.
      return column.withMode(GROUP_REF, { ...column.marks, name: to })
    })

    return found ? new Row(this.length, columns, this.name) : this
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
      this.name,
    )
  }
}
