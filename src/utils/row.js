import {
  Column,
  DEFAULT_GROUP_NAME,
  GROUP_END,
  GROUP_REF,
  GROUP_REPEAT,
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
      this.name,
    )
  }

  /**
   * This row with a group put down at `col`: the whole of that group in one
   * column, and how many times it is played in a new column beside it.
   *
   * Whatever stood at `col` is gone — a column saying a group is played
   * here is not a position, so there is nowhere in it for a note to be —
   * and the row is one position longer than it was, every column past the
   * two being pushed along to make room for the count.
   */
  withGroupAt(col, name) {
    if (col < 0 || col >= this.columns.length) return this

    const placed = new Column(col, null, GROUP_REF, { name })
    const counted = new Column(col + 1, null, GROUP_REPEAT, { repeat: 1 })
    const after = this.columns.slice(col + 1).map((column, i) => column.at(col + 2 + i))

    return new Row(
      this.length + 1,
      [...this.columns.slice(0, col), placed, counted, ...after],
      this.name,
    )
  }

  /**
   * This row without the group that opens at `col`: its two ends and the
   * count past them are gone, and the row is three positions shorter.
   *
   * What was written *inside* the group stays. The three columns are the
   * group — they are what say a run of positions is played again — and the
   * notes between them are the music, which is nobody's to throw away here.
   */
  withoutGroupAt(col) {
    const group = this.groups.find((each) => each.start === col)
    if (!group) return this

    const gone = new Set([group.start, group.end])
    if (group.repeatAt !== null) gone.add(group.repeatAt)

    return without(this, gone)
  }

  /**
   * This row without the group that was played at `col`: that column goes
   * back to being a plain position, empty, and the count beside it is gone
   * — exactly undoing `withGroupAt`, down to the length.
   */
  withoutRefAt(col) {
    const standing = this.columns[col]
    if (!standing?.isGroupRef) return this

    const past = this.columns[col + 1]
    const gone = new Set(past?.cssMode === GROUP_REPEAT ? [past.rowPosition] : [])
    const freed = this.columns.map((column) =>
      column.rowPosition === col ? new Column(col) : column,
    )

    return without(new Row(this.length, freed, this.name), gone)
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
      return column.withMode(GROUP_REF, { name: to })
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
