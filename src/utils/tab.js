/**
 * Shared tab model + serialization helpers.
 *
 * The grid is stored column-major: `grid[colIndex][stringIndex]` holds the text
 * typed on that string ('' when the string is not played). Column-major keeps a
 * "chord" (one vertical slice) contiguous, which is how the app is edited and
 * how every export walks the data.
 *
 * String index 0 is the highest-pitched string (high E), matching the way
 * guitar tab is conventionally drawn top-to-bottom.
 */

export const STRING_COUNT = 6

/** Top-to-bottom string labels in standard tuning. */
export const STANDARD_TUNING = ['e', 'B', 'G', 'D', 'A', 'E']

/**
 * Positions between two heavier guide lines — one bar, and the unit a row is
 * measured and grown in. Mirrored by `--bar-w` in styles.css.
 */
export const COLS_PER_BAR = 4

/** Bars a row starts with, before any are added to it. */
export const DEFAULT_BARS = 4

/** Rows a new sheet starts with. */
export const INITIAL_ROWS = 1

/** Highest fret accepted in a cell. */
export const MAX_FRET = 24

// Importing is deliberately bounded. The editor can validate a normal song a
// cell at a time, but an imported JSON file is parsed wholesale and could
// otherwise ask `fitGrid` to allocate an impractically large sheet.
const MAX_IMPORT_COLUMNS = 10_000
const MAX_IMPORT_ROWS = 1_000
const MAX_IMPORT_BARS_PER_ROW = MAX_IMPORT_COLUMNS / COLS_PER_BAR

export const createColumn = () => Array(STRING_COUNT).fill('')

export const createGrid = (columns) => Array.from({ length: columns }, createColumn)

/* Rows ------------------------------------------------------------------
 *
 * `rows` is one bar count per staff line, so rows can differ in length. The
 * grid stays one flat run of columns: a row's columns are the slice starting
 * at its own offset, which is why every helper here works in bar counts and
 * hands back absolute column indices.
 */

export const createRows = (count = INITIAL_ROWS) => Array(count).fill(DEFAULT_BARS)

/* Row ids ----------------------------------------------------------------
 *
 * A row's id is its name rather than its place: it is what the row's own name
 * is written against, and what says which group the row is in. It stays with
 * the tab written in the row when that row is moved, which is what lets the
 * page be rearranged without anything said about a row meaning something
 * different afterwards.
 *
 * Ids are held in a `rowIds` array parallel to `rows`, and are zero-based.
 */

/** The ids a new sheet's rows carry: one per row, counting from zero. */
export const createRowIds = (count = INITIAL_ROWS) =>
  Array.from({ length: count }, (_, i) => i)

/** A fresh id, past every one handed out so far. Ids are never reused. */
export const nextRowId = (rowIds) => (rowIds.length ? Math.max(...rowIds) + 1 : 0)

/** Drop the entries of a map kept by row id whose row has gone. */
const keptForRows = (map, rowIds) =>
  Object.fromEntries(Object.entries(map).filter(([id]) => rowIds.includes(Number(id))))

/* Row names --------------------------------------------------------------
 *
 * A row can be given a name of its own — "Intro", "Chorus" — written beside
 * the number at the top of the row. Names are held against the row id and not
 * against the row's place: a named row keeps its name wherever it is moved
 * to, and a name is only ever lost with the row it was given to.
 *
 * `names` is therefore a plain object keyed by id, and holds only the rows
 * that have been named — an unnamed row is simply absent from it.
 */

/** Longest a row name can be: enough to name a section, not a sentence. */
export const MAX_ROW_NAME = 24

/**
 * A name as it is kept: runs of whitespace squeezed out, the ends trimmed,
 * and the whole capped — so a name is what it looks like where it is shown
 * rather than whatever was typed around it. Shared by rows and by groups.
 */
const cleanName = (name, max) =>
  String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

/** The name this row carries, or '' when it has none. */
export const rowName = (names, id) => (typeof names[id] === 'string' ? names[id] : '')

/**
 * Name a row, or clear its name by passing an empty one. A cleared name is
 * dropped from the map outright rather than kept as an empty string, which is
 * what leaves a sheet nobody has named carrying nothing.
 */
export function setRowName(names, id, name) {
  const trimmed = cleanName(name, MAX_ROW_NAME)
  const rest = { ...names }
  delete rest[id]
  return trimmed ? { ...rest, [id]: trimmed } : rest
}

/** Drop the names of rows that are no longer on the sheet. */
export const clampRowNames = (names, rowIds) => keptForRows(names, rowIds)

/**
 * The sheet's written note — the paragraph above the running order, for what
 * the staves cannot say: a tuning, a capo, who it is by, what to listen for.
 * Called a memo throughout the code because "note" is taken twice over here,
 * once by the fret numbers on the strings and once by a published sheet.
 *
 * It is one string belonging to the whole sheet, so it needs no shaping
 * beyond a limit — long enough for a few paragraphs, short enough that a
 * pasted book cannot arrive through a file.
 */
export const MAX_MEMO = 4000

/** A memo from a file, cut to the limit. Anything else reads as none. */
export const readMemo = (raw) => (typeof raw === 'string' ? raw.slice(0, MAX_MEMO) : '')

/** Columns a row of this many bars occupies. */
export const rowWidth = (bars) => bars * COLS_PER_BAR

/** Columns the whole sheet occupies. */
export const totalColumns = (rows) => rows.reduce((n, bars) => n + rowWidth(bars), 0)

/** Absolute column each row starts at. */
export function rowStarts(rows) {
  const starts = []
  let at = 0
  for (const bars of rows) {
    starts.push(at)
    at += rowWidth(bars)
  }
  return starts
}

/** Index of the row a column falls in, or -1 when it is past the end. */
export function rowAt(rows, col) {
  let at = 0
  for (let i = 0; i < rows.length; i += 1) {
    at += rowWidth(rows[i])
    if (col < at) return i
  }
  return -1
}

/**
 * Append an empty row at the bottom. Nothing already written moves, and the
 * row lands in no group — which is why this is not the whole of adding a row:
 * `addRowToGroup` below is, and it is the only caller.
 */
function appendRow({ rows, rowIds, grid, ties, marks }) {
  return {
    rows: [...rows, DEFAULT_BARS],
    // An id of its own, past every one already given out, so nothing said
    // about a row that has since been removed attaches itself to this one.
    rowIds: [...rowIds, nextRowId(rowIds)],
    grid: [...grid, ...createGrid(rowWidth(DEFAULT_BARS))],
    ties,
    marks,
  }
}

/* Groups ------------------------------------------------------------------
 *
 * A group is a collection of rows — a verse, a chorus, the four bars that
 * come back later. A sheet holds a list of them, each with a name of its own,
 * and starts with a single empty group to put rows in.
 *
 * Which rows a group holds is kept the other way round, as one entry per row:
 * `members` maps a row id to the group that row is in, and a row that has not
 * been put in one is simply absent. Kept that way because a row is in at most
 * one group, and because membership then travels with the row id exactly as
 * the row's name does — reordering and renaming rows need no bookkeeping here
 * at all, and deleting one is a single entry to drop.
 *
 * A group is drawn on the sheet as one bar across the top of the rows it
 * holds, which asks one thing of the order those rows stand in: **a group's
 * rows are always next to each other**. A group is therefore a place as well
 * as a collection — it stands where its rows stand — and joining or leaving
 * one moves the row, which is what `putRowInGroup` is for. Nothing else here
 * may break that run; `groupRuns` reads the sheet back out as it is laid out.
 */

/** Longest a group name can be: enough to name a section, not a sentence. */
export const MAX_GROUP_NAME = 24

/** The groups a new sheet starts with: one, empty and yet to be named. */
export const createGroups = () => [{ id: 0, name: '' }]

/** A fresh group id, past every one handed out so far. Ids are never reused. */
export const nextGroupId = (groups) =>
  groups.length ? Math.max(...groups.map((group) => group.id)) + 1 : 0

/** Add an empty group at the end of the list. */
export const addGroup = (groups) => [...groups, { id: nextGroupId(groups), name: '' }]

/** Name a group, or clear its name by passing an empty one. */
export function setGroupName(groups, id, name) {
  const trimmed = cleanName(name, MAX_GROUP_NAME)
  return groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group))
}

/**
 * What a group is called: the name it was given, or where it stands in the
 * list. A group nobody has named is still something to point at, so it
 * answers to its place until it has a name of its own.
 */
export function groupLabel(groups, id) {
  const at = groups.findIndex((group) => group.id === id)
  return at < 0 ? '' : groups[at].name || `Group ${at + 1}`
}

/** The group this row is in, or null when it is in none. */
export const groupOfRow = (members, rowId) =>
  Number.isInteger(members[rowId]) ? members[rowId] : null

/** Put a row in a group, or take it out of the one it is in with null. */
export function setRowGroup(members, rowId, groupId) {
  const rest = { ...members }
  delete rest[rowId]
  return Number.isInteger(groupId) ? { ...rest, [rowId]: groupId } : rest
}

/** The rows a group holds, as row indices, in the order they stand on the page. */
export const rowsInGroup = (members, rowIds, groupId) =>
  rowIds
    .map((id, rowIndex) => (groupOfRow(members, id) === groupId ? rowIndex : -1))
    .filter((rowIndex) => rowIndex >= 0)

/**
 * The sheet as it is laid out, top to bottom: one block per group, holding the
 * run of rows that group holds, and one block of its own for each row that is
 * in no group.
 *
 * Reading the blocks off the rows rather than off the list of groups is what
 * puts each group where its rows are. A sheet whose groups have somehow been
 * left scattered still reads back correctly — such a group simply comes out as
 * more than one block — so nothing drawn from this can be made nonsense by a
 * file written elsewhere.
 */
export function groupRuns(members, rowIds, groups) {
  const blocks = []

  rowIds.forEach((id, rowIndex) => {
    const groupId = groupOfRow(members, id)
    const last = blocks[blocks.length - 1]

    if (groupId !== null && last?.group?.id === groupId) {
      last.rows.push(rowIndex)
      return
    }

    const group = groupId === null ? null : (groups.find((one) => one.id === groupId) ?? null)
    blocks.push({ group, rows: [rowIndex] })
  })

  return blocks
}

/**
 * The groups holding no rows at all. They have nowhere of their own to stand
 * on the sheet, so the view gathers them at the end: a group is somewhere to
 * put rows before it is a bar over any.
 */
export const emptyGroups = (members, rowIds, groups) =>
  groups.filter((group) => rowsInGroup(members, rowIds, group.id).length === 0)

/**
 * The groups holding at least one row: the ones there is something to play.
 * An empty group is somewhere to put rows rather than a part of the song, so
 * it is not yet a thing the running order can be built out of.
 */
export const filledGroups = (members, rowIds, groups) =>
  groups.filter((group) => rowsInGroup(members, rowIds, group.id).length > 0)

/**
 * Take a group off the sheet. The rows it held are not touched — they stay
 * exactly where they stand and are simply in no group afterwards, which is
 * what keeps deleting a group a thing done to the sheet's structure rather
 * than to its music.
 */
export function removeGroup(groups, members, arrangement, groupId) {
  const kept = groups.filter((group) => group.id !== groupId)
  return {
    groups: kept,
    members: Object.fromEntries(
      Object.entries(members).filter(([, id]) => id !== groupId),
    ),
    // A block in the running order stands for a group, so a group that has
    // gone cannot be left standing in it.
    arrangement: clampArrangement(arrangement, kept),
  }
}

/** Drop memberships whose row, or whose group, has gone. */
export const clampMembers = (members, rowIds, groups) =>
  Object.fromEntries(
    Object.entries(keptForRows(members, rowIds)).filter(([, groupId]) =>
      groups.some((group) => group.id === groupId),
    ),
  )

/* The arrangement -------------------------------------------------------- */

/**
 * The order the sheet's groups are played in: a verse, a chorus, that verse
 * again. Kept as a list of group ids rather than as anything on the groups
 * themselves, because an arrangement is a sequence and not a property — the
 * same group may stand in it twice, or not at all, and a sheet with no
 * arrangement written yet is simply an empty list.
 *
 * A block in the list is addressed by where it stands, not by which group it
 * names, since two blocks naming the same group are two different blocks.
 */

/** Put a group at the end of the running order. */
export const addToArrangement = (arrangement, groupId) => [...arrangement, groupId]

/** Take out the block standing at `at`, leaving any other block on that group. */
export const removeFromArrangement = (arrangement, at) =>
  arrangement.filter((_, place) => place !== at)

/** Drop blocks whose group has gone, so none is left pointing at nothing. */
export const clampArrangement = (arrangement, groups) =>
  arrangement.filter((id) => groups.some((group) => group.id === id))

/* A blank sheet ---------------------------------------------------------- */

/**
 * The sheet a blank page starts on: one empty row, inside the one group a new
 * sheet carries. A row standing in a group from the start is what makes the
 * group the thing rows are written into rather than something to be set up
 * first, and the one row is where the writing begins.
 *
 * Both the editor's opening sheet and the one Clear leaves behind come from
 * here, so "blank" cannot come to mean two different things.
 */
export function createSheet() {
  const rows = createRows()
  const rowIds = createRowIds(rows.length)
  const groups = createGroups()

  return {
    rows,
    rowIds,
    names: {},
    groups,
    members: Object.fromEntries(rowIds.map((id) => [id, groups[0].id])),
    grid: createGrid(totalColumns(rows)),
    // Nothing is arranged until the writer says so: the running order starts
    // empty even though the sheet starts with a group.
    arrangement: [],
    ties: [],
    marks: [],
  }
}

/** Absolute columns of one row, as [from, past-the-end). The last by default. */
export const rowRange = (rows, rowIndex = rows.length - 1) => {
  const start = rowStarts(rows)[rowIndex]
  return [start, start + rowWidth(rows[rowIndex])]
}

/** How many notes stand in a row — what removing it would erase. */
export function rowNoteCount(grid, rows, rowIndex = rows.length - 1) {
  const [from, to] = rowRange(rows, rowIndex)
  return grid
    .slice(from, to)
    .reduce((n, column) => n + column.filter((cell) => cell !== '').length, 0)
}

/**
 * Drop a row — the last one unless another is named. Everything it held goes
 * with it, arcs and symbols included, and its run of columns is cut out of the
 * grid, so every row below slides up by its width. The same bookkeeping as
 * `removeBar`, a whole row wide. A sheet never drops below one row.
 */
export function removeRow(
  { rows, rowIds, names, members, grid, ties, marks },
  rowIndex = rows.length - 1,
) {
  if (rows.length <= 1 || rowIndex < 0 || rowIndex >= rows.length) {
    return { rows, rowIds, names, members, grid, ties, marks }
  }

  const [at, end] = rowRange(rows, rowIndex)
  const width = end - at
  const inside = (col) => col >= at && col < end
  const shift = (col) => (col >= end ? col - width : col)
  const without = (list) => list.filter((_, i) => i !== rowIndex)
  const kept = without(rowIds)

  return {
    rows: without(rows),
    rowIds: kept,
    grid: [...grid.slice(0, at), ...grid.slice(end)],
    // A tie with an end in the removed row has lost the note it was holding.
    ties: ties
      .filter((tie) => !inside(tie.from) && !inside(tie.to))
      .map((tie) => ({ ...tie, from: shift(tie.from), to: shift(tie.to) })),
    marks: marks.filter((mark) => !inside(mark.col)).map((mark) => ({ ...mark, col: shift(mark.col) })),
    // Neither the name the row was given nor the group it was in outlives it.
    names: clampRowNames(names, kept),
    members: keptForRows(members, kept),
  }
}

/**
 * Put the rows in a new order, the tab written in them and all.
 *
 * `order` is one entry per place on the page, naming the row that now stands
 * there: `[2, 0, 1]` brings the third row to the top. Every way the sheet is
 * rearranged comes through here — swapping two rows, gathering a group — so
 * there is one place that knows what moving a row costs.
 *
 * Rows can differ in length, so this is not a shuffle of equal slices: the
 * grid is rebuilt run by run in the new order, and each row's columns travel
 * by the distance that row's own start moved. Arcs and symbols are held in
 * absolute columns, so they are carried the same distance as the notes they
 * hang on rather than left behind pointing at them.
 *
 * The row ids travel too, so everything said about a row — the name it was
 * given, the group it is in — goes with the music rather than staying behind
 * with the place on the page.
 */
export function reorderRows({ rows, rowIds, grid, ties, marks }, order) {
  // Anything but one place per row would lose or duplicate a row's columns.
  if (!Array.isArray(order) || order.length !== rows.length) {
    return { rows, rowIds, grid, ties, marks }
  }

  const starts = rowStarts(rows)
  const moved = order.map((from) => rows[from])
  const movedStarts = rowStarts(moved)
  // How far the columns of each row travel, by where that row stood before.
  const drift = new Map(order.map((from, to) => [from, movedStarts[to] - starts[from]]))

  const moveCol = (col) => {
    const row = rowAt(rows, col)
    return row < 0 ? col : col + drift.get(row)
  }

  return {
    rows: moved,
    rowIds: order.map((from) => rowIds[from]),
    grid: [
      ...order.flatMap((from) => grid.slice(starts[from], starts[from] + rowWidth(rows[from]))),
      // Columns past the last row belong to no row, so they are not ours to
      // move; they are left where they are for `fitGrid` to trim.
      ...grid.slice(totalColumns(rows)),
    ],
    ties: ties.map((tie) => ({ ...tie, from: moveCol(tie.from), to: moveCol(tie.to) })),
    marks: marks.map((mark) => ({ ...mark, col: moveCol(mark.col) })),
  }
}

/**
 * Exchange two rows, the tab in them and all.
 *
 * A group is a bar over a run of rows, so which group a row is in belongs to
 * the place it stands rather than to the row: a row swapped into the middle
 * of a group joins that group, and the row it changed places with takes the
 * group it has left. Anything else would carry a row out of its bracket and
 * leave the group drawn over a row that is not in it.
 */
export function swapRows({ rows, rowIds, members, grid, ties, marks }, a, b) {
  const last = rows.length - 1
  if (a === b || a < 0 || b < 0 || a > last || b > last) {
    return { rows, rowIds, members, grid, ties, marks }
  }

  const order = rows.map((_, at) => (at === a ? b : at === b ? a : at))
  const swapped = reorderRows({ rows, rowIds, grid, ties, marks }, order)

  // The two memberships stay behind with the places, which is the one thing
  // about a row that does not travel with it.
  const groupOfA = groupOfRow(members, rowIds[a])
  const groupOfB = groupOfRow(members, rowIds[b])

  return {
    ...swapped,
    members: setRowGroup(setRowGroup(members, rowIds[a], groupOfB), rowIds[b], groupOfA),
  }
}

/**
 * Move a row to a given place on the sheet, and into the group that place
 * belongs to — `null` for a place in no group.
 *
 * `to` names a gap rather than a row: the place *before* the row standing
 * there now, counting from 0 above the first row to `rows.length` below the
 * last. That is what a press between two rows means, and it is the one way of
 * saying "here" that does not change meaning as the row is lifted out.
 *
 * Which group the row lands in is told rather than worked out, because only
 * the gap pressed knows it: the place between two rows of a group is inside
 * that group's bracket, and the place between two groups is inside neither.
 *
 * Hands back the sheet, the memberships, and the place the row ended up in —
 * which is what it has to be called by afterwards.
 */
export function moveRowTo(sheet, from, to, groupId = null) {
  const { rows, rowIds, members } = sheet
  if (from < 0 || from >= rows.length || to < 0 || to > rows.length) {
    return { ...sheet, members, at: from }
  }

  // Lifted out of the order, then put back down in the gap. The gap is named
  // in the order as it stands, so one past the row lifted out is one fewer
  // place once it is gone.
  const order = rows.map((_, at) => at)
  order.splice(from, 1)
  const at = to > from ? to - 1 : to
  order.splice(at, 0, from)

  return {
    ...reorderRows(sheet, order),
    members: setRowGroup(members, rowIds[from], groupId),
    at,
  }
}

/**
 * Put a row in a group, or take it out of the one it is in with null — and
 * move the row to where that leaves it standing.
 *
 * A group is one bar over a run of rows, so joining a group gathers the row to
 * the end of that group's run, and leaving one drops the row just past the run
 * it was in. A row joining a group that holds nothing yet stays exactly where
 * it is: that row is where the group now stands.
 */
export function putRowInGroup(sheet, rowIndex, groupId) {
  const { rows, rowIds, members } = sheet
  if (rowIndex < 0 || rowIndex >= rows.length) return { ...sheet, members, at: rowIndex }

  // The group whose run the move is about: the one being joined, or — when
  // the row is leaving every group — the one it is stepping out of.
  const was = groupOfRow(members, rowIds[rowIndex])
  const concerned = Number.isInteger(groupId) ? groupId : was
  const run = rowsInGroup(members, rowIds, concerned).filter((at) => at !== rowIndex)

  // Past the end of that run, or — for a group holding nothing yet — the
  // place the row already stands in.
  const to = run.length ? run[run.length - 1] + 1 : rowIndex
  return moveRowTo(sheet, rowIndex, to, groupId)
}

/**
 * Add an empty row to the end of a group — the one way the sheet grows, since
 * a row is written inside a group rather than beside one.
 *
 * The row is appended and then gathered to the end of that group's run, which
 * is `putRowInGroup`'s business: a group's rows stand next to each other, so
 * where the new row lands is decided by where the group already is. A group
 * holding nothing yet takes it where that group stands, at the end.
 *
 * Hands back the sheet and the place the new row ended up in, which is what
 * it has to be called by afterwards.
 */
export function addRowToGroup(sheet, groupId) {
  const grown = { ...sheet, ...appendRow(sheet) }
  return putRowInGroup(grown, grown.rows.length - 1, groupId)
}

/** Grow the grid so it exactly covers `rows`, keeping what is already written. */
export function fitGrid(grid, rows) {
  const target = totalColumns(rows)
  if (grid.length === target) return grid
  return grid.length > target
    ? grid.slice(0, target)
    : [...grid, ...createGrid(target - grid.length)]
}

/**
 * Add a bar to the end of one row. The grid gains that row's worth of empty
 * columns in place, so everything written after it slides along — and its ties
 * and symbols have to slide with it, since both are held in absolute columns.
 */
export function addBar({ rows, grid, ties, marks }, rowIndex) {
  if (rowIndex < 0 || rowIndex >= rows.length) return { rows, grid, ties, marks }

  const at = rowRange(rows, rowIndex)[1]
  const shift = (col) => (col >= at ? col + COLS_PER_BAR : col)

  return {
    rows: rows.map((bars, i) => (i === rowIndex ? bars + 1 : bars)),
    grid: [...grid.slice(0, at), ...createGrid(COLS_PER_BAR), ...grid.slice(at)],
    ties: ties.map((tie) => ({ ...tie, from: shift(tie.from), to: shift(tie.to) })),
    marks: marks.map((mark) => ({ ...mark, col: shift(mark.col) })),
  }
}

/** Absolute columns of the last bar of a row, as [from, past-the-end). */
export function lastBarRange(rows, rowIndex) {
  const end = rowRange(rows, rowIndex)[1]
  return [end - COLS_PER_BAR, end]
}

/** How many notes stand in the last bar of a row — what removing it would erase. */
export function lastBarNoteCount(grid, rows, rowIndex) {
  const [from, to] = lastBarRange(rows, rowIndex)
  return grid
    .slice(from, to)
    .reduce((n, column) => n + column.filter((cell) => cell !== '').length, 0)
}

/**
 * Take the last bar off a row. The mirror of `addBar`: its columns are cut out
 * of the grid, so everything after slides back, and anything anchored inside
 * the removed bar goes with it — an arc with one end in there has lost the
 * note it was holding. A row never drops below one bar.
 */
export function removeBar({ rows, grid, ties, marks }, rowIndex) {
  if (rowIndex < 0 || rowIndex >= rows.length || rows[rowIndex] <= 1) {
    return { rows, grid, ties, marks }
  }

  const [at, end] = lastBarRange(rows, rowIndex)
  const inside = (col) => col >= at && col < end
  const shift = (col) => (col >= end ? col - COLS_PER_BAR : col)

  return {
    rows: rows.map((bars, i) => (i === rowIndex ? bars - 1 : bars)),
    grid: [...grid.slice(0, at), ...grid.slice(end)],
    ties: ties
      .filter((tie) => !inside(tie.from) && !inside(tie.to))
      .map((tie) => ({ ...tie, from: shift(tie.from), to: shift(tie.to) })),
    marks: marks.filter((mark) => !inside(mark.col)).map((mark) => ({ ...mark, col: shift(mark.col) })),
  }
}

/**
 * The stretch of a row a shift moves, and where it lands.
 *
 * A shift always carries the anchor and everything to its right, whichever way
 * it travels. Going right, the anchor's own position is left empty behind it
 * and the far end of the row is pushed off; going left, the position before
 * the anchor is written over and the far end of the row is left empty. With no
 * anchor the whole row travels, which is the same thing anchored at its first
 * position — so the two are one operation, and this is where that is decided.
 */
export function shiftBlock(rows, rowIndex, step, anchor = null) {
  const start = rowStarts(rows)[rowIndex]
  const end = start + rowWidth(rows[rowIndex]) - 1
  // The block runs from the anchor to the end of the row, always.
  const from = anchor === null ? start : Math.min(end, Math.max(start, anchor))
  // The position at the head of the block in the direction it is travelling.
  const lead = step > 0 ? end : from
  const lands = lead + step

  return {
    start,
    end,
    from,
    to: end,
    lead,
    // The position written over, or null when the head of the block is pushed
    // past the end of the row instead and lost.
    landing: lands >= start && lands <= end ? lands : null,
    // The position the block leaves empty behind it.
    vacated: step > 0 ? from : end,
  }
}

/**
 * What a shift would destroy: one position's worth of notes, either written
 * over where the block lands or pushed off the end of the row.
 */
export function shiftLoss(grid, rows, rowIndex, step, anchor = null) {
  const { landing, lead } = shiftBlock(rows, rowIndex, step, anchor)
  return {
    notes: grid[landing ?? lead].filter((cell) => cell !== '').length,
    overwritten: landing !== null,
  }
}

/**
 * Slide part of a row along by a position — the anchor and everything to its
 * right. What the block lands on is gone, as is anything pushed past the end
 * of the row, arcs and symbols included. Rows either side are untouched.
 */
export function shiftRow({ rows, grid, ties, marks }, rowIndex, step, anchor = null) {
  const { start, end, from, to, landing, vacated } = shiftBlock(rows, rowIndex, step, anchor)
  const inBlock = (col) => col >= from && col <= to
  const inRow = (col) => col >= start && col <= end
  const moved = (col) => col + step

  // Read from the grid as it was and write into the copy, so no position is
  // read after something has been written over it.
  const nextGrid = [...grid]
  for (let col = from; col <= to; col += 1) {
    if (inRow(moved(col))) nextGrid[moved(col)] = grid[col]
  }
  nextGrid[vacated] = createColumn()

  // The note that was standing where the block lands has been written over, so
  // whatever hung on it goes too. `landing` is null when nothing is written
  // over, and no column ever matches it.
  const survives = (col) => col !== landing

  return {
    rows,
    grid: nextGrid,
    // A tie travels only if both its ends do and both stay in the row: one end
    // moving without the other would leave an arc between two unrelated notes.
    ties: ties
      .filter((tie) =>
        inBlock(tie.from) || inBlock(tie.to)
          ? inBlock(tie.from) &&
            inBlock(tie.to) &&
            inRow(moved(tie.from)) &&
            inRow(moved(tie.to))
          : survives(tie.from) && survives(tie.to),
      )
      .map((tie) =>
        inBlock(tie.from) ? { ...tie, from: moved(tie.from), to: moved(tie.to) } : tie,
      ),
    marks: marks
      .filter((mark) => (inBlock(mark.col) ? inRow(moved(mark.col)) : survives(mark.col)))
      .map((mark) => (inBlock(mark.col) ? { ...mark, col: moved(mark.col) } : mark)),
  }
}

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
 * The nearest written position before `col`, or -1 when there is none. The
 * sheet is one continuous run of columns, so this walks back past the start of
 * a row into the one above it: what is being looked for is the last chord
 * played, and a row break is not a gap in the song.
 */
export function previousWrittenColumn(grid, col) {
  for (let at = Math.min(col, grid.length) - 1; at >= 0; at -= 1) {
    if (grid[at].some((cell) => cell !== '')) return at
  }
  return -1
}

/**
 * Write one position over another — the same chord played again, taken from
 * where it was written rather than typed out a second time. The target holds
 * the source and nothing else: strings silent there fall silent here too.
 *
 * Symbols come with the notes they sit on. Arcs cannot: one needs a note at
 * each end, so an arc ending on the target has lost the note it was holding
 * and goes, the same as if that note had been erased.
 */
export function copyColumn(sheet, fromCol, toCol) {
  const { rows, grid, ties, marks } = sheet
  const valid = (col) => col >= 0 && col < grid.length
  if (!valid(fromCol) || !valid(toCol) || fromCol === toCol) return sheet

  return {
    rows,
    grid: grid.map((column, col) => (col === toCol ? [...grid[fromCol]] : column)),
    ties: ties.filter((tie) => tie.from !== toCol && tie.to !== toCol),
    marks: [
      ...marks.filter((mark) => mark.col !== toCol),
      ...marks
        .filter((mark) => mark.col === fromCol)
        .map((mark) => ({ ...mark, col: toCol })),
    ],
  }
}

/* Copying a range ---------------------------------------------------------
 *
 * Range copy picks out a stretch of positions on one staff line and writes it
 * down again starting wherever a paste button is pressed. A range never spans
 * two rows: the sheet is one flat run of columns, so a stretch that crossed a
 * row break would read as continuous here while looking like two unrelated
 * fragments on the page.
 */

/** A pair of pressed positions as a range, whichever order they were pressed. */
export const makeRange = (row, a, b) => ({
  row,
  from: Math.min(a, b),
  to: Math.max(a, b),
})

/** How many positions a range covers. */
export const rangeLength = ({ from, to }) => to - from + 1

/**
 * Where a paste would land: the target span, and whether it fits on the row it
 * starts on. A range is written down as one block, so a paste that would run
 * off the end of its row does not happen at all rather than landing clipped —
 * half a phrase is not what was asked for.
 */
export function pasteTarget(rows, range, at) {
  const row = rowAt(rows, at)
  const start = rowStarts(rows)[row]
  const end = start + rowWidth(rows[row]) - 1
  const last = at + rangeLength(range) - 1

  return { row, start, end, at, last, fits: last <= end }
}

/**
 * The notes a paste would write over — what the confirmation prompt counts.
 * Only positions the paste actually lands on are looked at, and only when it
 * fits: a paste that will be refused overwrites nothing.
 */
export function pasteLoss(grid, rows, range, at) {
  const { last, fits } = pasteTarget(rows, range, at)
  if (!fits) return 0

  let notes = 0
  for (let col = at; col <= last; col += 1) {
    notes += grid[col].filter((cell) => cell !== '').length
  }
  return notes
}

/**
 * Write a range of positions down again starting at `at`, symbols and arcs
 * included. The target span holds the source and nothing else: a position that
 * was empty in the range empties the one it lands on.
 *
 * Everything is read out of the sheet before any of it is written back, so a
 * range may be pasted over itself — a phrase copied one position along its own
 * row reads its source intact rather than chasing what it has just written.
 *
 * An arc travels only when both of its ends are inside the range. One that
 * runs out of the range has lost the note at its far end, and an arc drawn
 * between two notes that were never joined is not what was copied. Arcs
 * reaching into the target span go for the same reason a written-over note
 * takes its arcs with it.
 */
export function pasteRange(sheet, range, at) {
  const { rows, grid, ties, marks } = sheet
  const { from, to } = range
  const step = at - from
  const last = at + rangeLength(range) - 1
  const inSource = (col) => col >= from && col <= to
  const inTarget = (col) => col >= at && col <= last

  // Read first, write second: source and target may be the same positions.
  const copied = grid.slice(from, to + 1).map((column) => [...column])
  const movedMarks = marks
    .filter((mark) => inSource(mark.col))
    .map((mark) => ({ ...mark, col: mark.col + step }))
  const movedTies = ties
    .filter((tie) => inSource(tie.from) && inSource(tie.to))
    .map((tie) => ({ ...tie, from: tie.from + step, to: tie.to + step }))

  return {
    rows,
    grid: grid.map((column, col) => (inTarget(col) ? copied[col - at] : column)),
    ties: [...ties.filter((tie) => !inTarget(tie.from) && !inTarget(tie.to)), ...movedTies],
    marks: [...marks.filter((mark) => !inTarget(mark.col)), ...movedMarks],
  }
}

/** True when nothing has been written anywhere in the grid. */
export const isGridEmpty = (grid) =>
  grid.every((column) => column.every((cell) => cell === ''))

/**
 * Whether anything has actually been written on a sheet: a note, a row or
 * group name, a title, a memo.
 *
 * The layout by itself does not count. The editor saves on every keystroke,
 * so a page that was only ever opened leaves a saved sheet behind anyway, and
 * the rows and groups it came up with say that the editor was once open — not
 * that anyone wrote anything in it.
 */
export const isSheetWritten = ({ grid, names, groups, title, memo, arrangement }) =>
  !isGridEmpty(grid) ||
  title.trim() !== '' ||
  memo.trim() !== '' ||
  Object.values(names).some((name) => name) ||
  groups.some((group) => group.name) ||
  (arrangement?.length ?? 0) > 0

/** Index of the last column holding a note, or -1 when the grid is empty. */
export const lastUsedColumn = (grid) => {
  for (let col = grid.length - 1; col >= 0; col -= 1) {
    if (grid[col].some((cell) => cell !== '')) return col
  }
  return -1
}

/**
 * Rows a rendered export covers: up to and including the last one holding a
 * note, and never fewer than one so the output is never degenerate.
 */
export function contentRows(grid, rows) {
  const last = lastUsedColumn(grid)
  return last < 0 ? rows.slice(0, 1) : rows.slice(0, rowAt(rows, last) + 1)
}


/* Ties ------------------------------------------------------------------
 *
 * A tie is the arc drawn between two positions of the same fret on the same
 * string: `{ string, from, to }` with `from` < `to` in absolute grid columns.
 */

/* Marks -----------------------------------------------------------------
 *
 * A mark is a symbol drawn above one number: `{ string, col, symbol }`. A note
 * carries at most one, since they occupy the same space above the digit. The
 * zigzag is currently the only symbol, but marks stay keyed by name so a file
 * written today still reads back if another one is added.
 */

export const MARK_ZIGZAG = 'zigzag'
export const MARK_SYMBOLS = [MARK_ZIGZAG]

/** Letter appended to the fret in ASCII exports, which cannot draw a symbol. */
export const MARK_ASCII = {
  [MARK_ZIGZAG]: 'w',
}

/** The symbol sitting above a note, or null. */
export const markAt = (marks, string, col) =>
  marks.find((mark) => mark.string === string && mark.col === col)?.symbol ?? null

/** Apply a symbol to a note; applying the one already there removes it. */
export function toggleMark(marks, string, col, symbol) {
  const kept = marks.filter((mark) => !(mark.string === string && mark.col === col))
  const current = markAt(marks, string, col)
  return current === symbol ? kept : [...kept, { string, col, symbol }]
}

/** Build a tie from a drag, whichever direction it was dragged in. */
export const makeTie = (string, a, b) => ({
  string,
  from: Math.min(a, b),
  to: Math.max(a, b),
})

export const isSameTie = (a, b) =>
  a.string === b.string && a.from === b.from && a.to === b.to

/** True when the tie ends on this position — i.e. erasing it breaks the tie. */
export const tieTouches = (tie, string, col) =>
  tie.string === string && (tie.from === col || tie.to === col)

/**
 * True when two ties would hang off the same side of the same note.
 *
 * A note carries at most two arcs: one back to the note before it and one on
 * to the note after it, so what two ties may not share is an *end* — two arcs
 * leaving the same note rightwards, or two arriving at it from the left. They
 * are free to meet at a note from opposite sides, which is what lets one note
 * be held through a run of positions.
 */
export const tiesClash = (a, b) =>
  a.string === b.string && (a.from === b.from || a.to === b.to)

/**
 * Render ASCII tab, one staff per row of the sheet:
 *
 *   e|--4---7--|
 *   B|--3---8--|
 *
 * Rows can differ in length, so each staff is as wide as its own row. Column
 * width follows the widest token in that column so a staff stays vertically
 * aligned. Ties fill the gap between their two notes with `~`, and a marked
 * note carries its symbol's letter (`7w`).
 */
export function toAsciiTab({ grid, rows, ties, marks }, tuning = STANDARD_TUNING) {
  // Tokens are resolved up front because a mark changes how wide a column is.
  const tokens = grid.map((column, col) =>
    column.map((cell, stringIndex) => {
      if (!cell) return ''
      const symbol = markAt(marks, stringIndex, col)
      return symbol ? cell + MARK_ASCII[symbol] : cell
    }),
  )
  const widths = tokens.map((column) => Math.max(1, ...column.map((token) => token.length)))

  const kept = contentRows(grid, rows)
  const starts = rowStarts(rows)
  // The final staff stops at the last thing written, so an export never trails
  // off into blank positions.
  const limit = Math.max(lastUsedColumn(grid) + 1, 1)

  const staves = []
  kept.forEach((bars, rowIndex) => {
    const start = starts[rowIndex]
    const end = Math.min(start + rowWidth(bars), Math.max(limit, start + 1))
    const slice = tokens.slice(start, end)
    const sliceWidths = widths.slice(start, end)
    const lastCol = slice.length - 1

    const lines = tuning.map((label, stringIndex) => {
      // Track where each column's token starts so ties can be painted in after.
      const offsets = []
      let body = ''
      slice.forEach((column, i) => {
        if (i > 0) body += '-'
        offsets.push(body.length)
        body += (column[stringIndex] || '-').padEnd(sliceWidths[i], '-')
      })

      const chars = body.split('')
      ties
        .filter((tie) => tie.string === stringIndex)
        .forEach((tie) => {
          const from = tie.from - start
          const to = tie.to - start
          if (to < 0 || from > lastCol) return
          // A tie that runs off either edge of this staff line is left open.
          const fillFrom =
            from >= 0 ? offsets[from] + (slice[from][stringIndex] || '-').length : 0
          const fillTo = to <= lastCol ? offsets[to] - 1 : chars.length - 1
          for (let i = fillFrom; i <= fillTo; i += 1) {
            if (chars[i] === '-') chars[i] = '~'
          }
        })

      return `${label}|-${chars.join('')}-|`
    })
    staves.push(lines.join('\n'))
  })

  return staves.join('\n\n') + '\n'
}

/** Machine-readable export that can round-trip back into the editor. */
export function toJson(
  { grid, rows, rowIds, names, groups, members, arrangement, ties, marks, memo },
  tuning = STANDARD_TUNING,
  title = '',
) {
  // Every row is kept, blank ones included: rows are added by hand now, so the
  // file records the sheet as it was left rather than trimming it back.
  return JSON.stringify(
    {
      format: 'fretboard-notebook',
      version: SHEET_VERSION,
      title,
      tuning,
      // The note written at the top of the sheet — prose about the song, which is
      // why it is kept whole rather than shaped on the way out.
      memo: readMemo(memo),
      // One bar count per staff row; rows can differ in length.
      rows,
      // One id per staff row, in row order. A row's id is its name, so
      // reordering the rows reorders these with them.
      rowIds,
      // The names rows have been given, keyed by row id — only the rows that
      // have one. Keyed by id rather than by place, since the name belongs to
      // the row and not to the line it happens to be written on.
      names: clampRowNames(names, rowIds),
      // The groups the sheet holds. Which rows each one holds is read from
      // `members`, and where it stands is read from where those rows stand.
      groups,
      // Which group each row is in, keyed by row id. Rows in none are absent.
      members: clampMembers(members, rowIds, groups),
      // The order the groups are played in, as group ids. Repeats are the
      // point of it; an empty list means nothing has been arranged.
      arrangement: clampArrangement(arrangement ?? [], groups),
      // Emitted high-string-first, the same order as `tuning`.
      columns: grid.slice(0, totalColumns(rows)),
      ties,
      marks,
    },
    null,
    2,
  )
}

const SHEET_VERSION = 12

/** Parse the current sheet format. Returns null when invalid. */
export function fromJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || data.format !== 'fretboard-notebook' || data.version !== SHEET_VERSION ||
      !Array.isArray(data.columns) || data.columns.length > MAX_IMPORT_COLUMNS ||
      !Array.isArray(data.rows) || !Array.isArray(data.rowIds) ||
      !Array.isArray(data.groups) || !Array.isArray(data.ties) || !Array.isArray(data.marks) ||
      !data.names || typeof data.names !== 'object' || Array.isArray(data.names) ||
      !data.members || typeof data.members !== 'object' || Array.isArray(data.members) ||
      typeof data.memo !== 'string' || typeof data.title !== 'string' || !Array.isArray(data.tuning)) {
    return null
  }

  const columns = data.columns
    .filter(Array.isArray)
    .map((column) =>
      Array.from({ length: STRING_COUNT }, (_, i) => normalizeCell(String(column[i] ?? ''))),
    )
  if (columns.length === 0) return null

  // Ties are dropped unless both ends land on a real note, so a hand-edited
  // file can never leave an arc hanging off nothing.
  const candidates = data.ties
    .filter(
      (tie) =>
        tie &&
        Number.isInteger(tie.string) &&
        Number.isInteger(tie.from) &&
        Number.isInteger(tie.to) &&
        tie.from !== tie.to &&
        tie.string >= 0 &&
        tie.string < STRING_COUNT &&
        columns[tie.from]?.[tie.string] &&
        columns[tie.to]?.[tie.string],
    )
    .map((tie) => makeTie(tie.string, tie.from, tie.to))

  // One arc per side of a note, the same rule the editor enforces: where a
  // file hangs two off the same side, the first one wins.
  const ties = candidates.reduce(
    (kept, tie) => (kept.some((other) => tiesClash(other, tie)) ? kept : [...kept, tie]),
    [],
  )

  // Same rule for marks: a symbol with no note under it is meaningless.
  const marks = data.marks
    .filter(
      (mark) =>
        mark &&
        MARK_SYMBOLS.includes(mark.symbol) &&
        Number.isInteger(mark.string) &&
        Number.isInteger(mark.col) &&
        columns[mark.col]?.[mark.string],
    )
    .map(({ string, col, symbol }) => ({ string, col, symbol }))

  const { rows, rowIds, groups } = data
  if (!rows.length || rows.length > MAX_IMPORT_ROWS ||
      rows.some((bars) => !Number.isInteger(bars) || bars <= 0 || bars > MAX_IMPORT_BARS_PER_ROW) ||
      totalColumns(rows) !== columns.length ||
      rowIds.length !== rows.length || rowIds.some((id) => !Number.isInteger(id) || id < 0) ||
      new Set(rowIds).size !== rowIds.length || !groups.length ||
      groups.some((group) => !group || !Number.isInteger(group.id) || group.id < 0 || typeof group.name !== 'string') ||
      new Set(groups.map((group) => group.id)).size !== groups.length) return null

  const members = readMembers(data.members, rowIds, groups)
  // A group must occupy one continuous run in the current format.
  const completed = new Set()
  let previous = null
  for (const id of rowIds) {
    const group = groupOfRow(members, id)
    if (group !== previous) {
      if (previous !== null) completed.add(previous)
      if (group !== null && completed.has(group)) return null
      previous = group
    }
  }

  return {
    title: data.title,
    grid: columns,
    rows,
    rowIds,
    names: readRowNames(data.names, rowIds),
    groups,
    members,
    arrangement: readArrangement(data.arrangement, groups),
    memo: readMemo(data.memo),
    ties,
    marks,
  }
}

/**
 * The running order from a file. The field arrived after the format did, so a
 * file without one is read as a sheet nobody has arranged rather than as a
 * malformed sheet — the same answer an empty list gives. Blocks naming a
 * group the file does not hold are dropped.
 */
function readArrangement(raw, groups) {
  if (!Array.isArray(raw)) return []
  return clampArrangement(raw.filter(Number.isInteger), groups)
}

/**
 * Which group each row is in, keyed by row id. An entry naming a row or a
 * group the file does not hold is dropped rather than left pointing at
 * nothing.
 */
function readMembers(raw, rowIds, groups) {
  const kept = Object.entries(raw).reduce((all, [key, value]) => {
    const rowId = Number(key)
    if (!Number.isInteger(rowId) || !Number.isInteger(value)) return all
    return { ...all, [rowId]: value }
  }, {})
  return clampMembers(kept, rowIds, groups)
}

/**
 * Row names from a file, keyed by row id. Anything that is not a name a row
 * here can carry is dropped: an id no row has, a value that is not a string,
 * a name that is empty once trimmed. Passing each one through `setRowName`
 * leaves the map holding exactly what the editor would have written.
 */
function readRowNames(raw, rowIds) {
  return Object.entries(raw).reduce((kept, [key, value]) => {
    const id = Number(key)
    if (!Number.isInteger(id) || !rowIds.includes(id) || typeof value !== 'string') return kept
    return setRowName(kept, id, value)
  }, {})
}

/**
 * What a published note may be called: runs of lowercase letters and digits,
 * joined by single dashes or underscores. A note's file name is its URL, so
 * the name is held to a shape that reads as one — which is also what stops a
 * slug read off the address bar from being bent into a path of its own.
 *
 * A separator has to separate, which is the whole of why this is not the
 * simpler `[a-z0-9][a-z0-9-_]*`: that spelling calls a name a separator sits
 * at the end of, or two sit together in, a word boundary, and `warm--up-`
 * would pass. Either mark does the joining, so both `e-minor-pentatonic` and
 * `tie_that_binds` are names; mixing them in one name is allowed too, since
 * nothing about a URL is harmed by it.
 */
export const NOTE_NAME = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

/**
 * Filesystem-safe file stem derived from the user's title. Underscores join
 * the words, which is the shape the published notes are named in — so a JSON
 * export is publishable as it comes out, with no renaming in between.
 *
 * A run of anything else collapses to one underscore and the ends are trimmed,
 * so what comes back always satisfies `NOTE_NAME`.
 */
export const slugify = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'fretboard_notebook'

/** Trigger a browser download for generated text or a rendered blob. */
export function downloadFile(filename, data, mime = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
