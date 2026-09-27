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
export const INITIAL_ROWS = 4

/** Highest fret accepted in a cell. */
export const MAX_FRET = 24

// Importing is deliberately bounded. The editor can validate a normal song a
// cell at a time, but an imported JSON file is parsed wholesale and could
// otherwise ask `fitGrid` to allocate an impractically large sheet.
const MAX_IMPORT_COLUMNS = 10_000
const MAX_IMPORT_ROWS = 1_000
const MAX_IMPORT_BARS_PER_ROW = MAX_IMPORT_COLUMNS / COLS_PER_BAR

/* Tempo ------------------------------------------------------------------
 *
 * The sheet's playback speed, in beats per minute. One column is one beat, so
 * this is what live mode turns into a scroll rate; it is saved with the song
 * because a tempo belongs to the song, not to the session reading it.
 */

export const DEFAULT_BPM = 90
export const MIN_BPM = 20
export const MAX_BPM = 300

/** A usable whole-number tempo, whatever was typed or read from a file. */
export const clampBpm = (bpm) => {
  const value = Math.round(Number(bpm))
  // Nothing typed reads as 0, which is a request for no tempo at all rather
  // than for the slowest one going — so it falls back rather than clamping.
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BPM
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value))
}

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

/* Group ids -------------------------------------------------------------
 *
 * A row's group id is its name rather than its place. It is the number in the
 * circle at the left of the row, it is what the running order calls for, and
 * it stays with the tab written in the row when that row is moved. That is
 * what lets the two orders be independent: the page can be rearranged without
 * the strip meaning anything different.
 *
 * Ids are held in a `groups` array parallel to `rows`, and are zero-based —
 * the same numbers the running order held back when a slot named a row by its
 * index, so every file written before ids existed reads back unchanged.
 */

/** The ids a new sheet's rows carry: one per row, counting from zero. */
export const createGroups = (count = INITIAL_ROWS) =>
  Array.from({ length: count }, (_, i) => i)

/** A fresh id, past every one handed out so far. Ids are never reused. */
export const nextGroupId = (groups) => (groups.length ? Math.max(...groups) + 1 : 0)

/** Where the row carrying this id sits, or -1 when no row does. */
export const rowOfGroup = (groups, id) => groups.indexOf(id)

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

/** Append an empty row at the bottom. Nothing already written moves. */
export function addRow({ rows, groups = createGroups(rows.length), grid, ties, marks }) {
  return {
    rows: [...rows, DEFAULT_BARS],
    // A name of its own, past every one already given out, so a slot naming
    // a row that has since been removed never picks up the new one.
    groups: [...groups, nextGroupId(groups)],
    grid: [...grid, ...createGrid(rowWidth(DEFAULT_BARS))],
    ties,
    marks,
  }
}

/* Groups -----------------------------------------------------------------
 *
 * A row is a group — a chunk of tab that can be played more than once. The
 * group section above the staves is the running order: `structure` is one slot
 * per position in the song, holding the row played there and how many times
 * over, or null where nothing has been chosen yet.
 *
 * A slot can call for its group more than once so that a row played four times
 * is one slot saying so, rather than the same number written out four times.
 */

/** Slots the group section shows even before anything has been put in them. */
export const MIN_GROUP_SLOTS = 8

/** The most times one slot can call for its group. */
export const MAX_GROUP_REPEAT = 8

/** A slot never plays its group less than once, nor more than the strip shows. */
const clampRepeat = (repeat) =>
  Number.isInteger(repeat) ? Math.min(Math.max(repeat, 1), MAX_GROUP_REPEAT) : 1

/** A filled slot: the row played there, and how many times over. */
const groupSlot = (group, repeat = 1) => ({ group, repeat: clampRepeat(repeat) })

/**
 * One slot as it comes back from a file, or null where nothing is set. A bare
 * row index is a slot played once — all a file held before repeats existed.
 */
export function readGroupSlot(entry) {
  if (Number.isInteger(entry)) return entry >= 0 ? groupSlot(entry) : null
  if (entry && Number.isInteger(entry.group) && entry.group >= 0) {
    return groupSlot(entry.group, entry.repeat)
  }
  return null
}

/** One slot as a file holds it: a bare row index unless a repeat was set. */
const writeGroupSlot = (entry) =>
  entry ? (entry.repeat > 1 ? { group: entry.group, repeat: entry.repeat } : entry.group) : null

/** Trailing blanks carry no meaning, so they never accumulate. */
const trimStructure = (structure) => {
  const kept = [...structure]
  while (kept.length && kept[kept.length - 1] === null) kept.pop()
  return kept
}

/**
 * Put a group in a slot, or clear it with null. Choosing the group already
 * there keeps the repeat set on it; choosing a different one starts again at
 * once through, since the count belonged to the group it was set on.
 */
export function setGroupSlot(structure, slot, group) {
  if (slot < 0) return structure
  const next = [...structure]
  while (next.length <= slot) next.push(null)
  const was = next[slot]
  next[slot] = group === null ? null : groupSlot(group, was?.group === group ? was.repeat : 1)
  return trimStructure(next)
}

/** Say how many times a slot plays its group. An empty slot has nothing to repeat. */
export function setGroupRepeat(structure, slot, repeat) {
  const was = structure[slot]
  if (!was) return structure
  const next = [...structure]
  next[slot] = groupSlot(was.group, repeat)
  return next
}

/**
 * Exchange two slots of the running order — how the strip is reordered by
 * hand. A slot past the end of what has been written is empty, so swapping a
 * filled slot with one of those moves it there rather than trading anything.
 */
export function swapGroupSlots(structure, a, b) {
  if (a === b || a < 0 || b < 0) return structure

  const next = [...structure]
  while (next.length <= Math.max(a, b)) next.push(null)
  const held = readGroupSlot(next[a])
  next[a] = readGroupSlot(next[b])
  next[b] = held
  return trimStructure(next)
}

/** Blank out slots calling for a group no row carries any more. */
export const clampStructure = (structure, groups) =>
  trimStructure(
    structure.map((entry) => {
      const slot = readGroupSlot(entry)
      return slot && groups.includes(slot.group) ? slot : null
    }),
  )

/** Absolute column the last row starts at. */
export const lastRowStart = (rows) => rowStarts(rows)[rows.length - 1]

/** How many notes stand in the last row — what removing it would erase. */
export function lastRowNoteCount(grid, rows) {
  return grid
    .slice(lastRowStart(rows))
    .reduce((n, column) => n + column.filter((cell) => cell !== '').length, 0)
}

/**
 * Drop the last row. Everything it held goes with it, arcs and symbols
 * included — nothing before it moves, since it is cut off the end. A sheet
 * never drops below one row.
 */
export function removeRow({ rows, groups = createGroups(rows.length), grid, ties, marks, structure = [] }) {
  if (rows.length <= 1) return { rows, groups, grid, ties, marks, structure }

  const at = lastRowStart(rows)
  const kept = groups.slice(0, -1)
  return {
    rows: rows.slice(0, -1),
    groups: kept,
    grid: grid.slice(0, at),
    // A tie reaching into the removed row has lost the note at that end.
    ties: ties.filter((tie) => tie.to < at),
    marks: marks.filter((mark) => mark.col < at),
    // The song can no longer call for a group that is gone.
    structure: clampStructure(structure, kept),
  }
}

/**
 * Exchange two rows, the tab in them and all.
 *
 * Rows can differ in length, so this is not a trade of two equal slices: the
 * grid is rebuilt with each row's run of columns standing where the other's
 * did, and whatever lay between them slides by the difference in their widths.
 * Arcs and symbols are held in absolute columns, so they are carried across
 * with the notes they hang on rather than left behind pointing at them.
 *
 * The group ids travel with the tab, so the row keeps its name wherever it is
 * put — swap the first and third rows and their circles read 3 and 1. That is
 * what leaves the running order untouched: a slot calls for a group by name,
 * and the name has gone with the music rather than stayed with the place.
 */
export function swapRows({ rows, groups = createGroups(rows.length), grid, ties, marks, structure = [] }, a, b) {
  const last = rows.length - 1
  if (a === b || a < 0 || b < 0 || a > last || b > last) {
    return { rows, groups, grid, ties, marks, structure }
  }

  // Named by which comes first on the page, so the grid can be cut in order.
  const [upper, lower] = a < b ? [a, b] : [b, a]
  const starts = rowStarts(rows)
  const upperWidth = rowWidth(rows[upper])
  const lowerWidth = rowWidth(rows[lower])
  const upperEnd = starts[upper] + upperWidth
  const lowerEnd = starts[lower] + lowerWidth
  // What the rows caught between the two gain or lose by the exchange.
  const drift = lowerWidth - upperWidth
  const gap = starts[lower] - starts[upper]

  const moveCol = (col) => {
    if (col >= starts[upper] && col < upperEnd) return col + gap + drift
    if (col >= starts[lower] && col < lowerEnd) return col - gap
    if (col >= upperEnd && col < starts[lower]) return col + drift
    return col
  }

  const exchange = (list) =>
    list.map((item, i) => (i === upper ? list[lower] : i === lower ? list[upper] : item))

  return {
    rows: exchange(rows),
    groups: exchange(groups),
    grid: [
      ...grid.slice(0, starts[upper]),
      ...grid.slice(starts[lower], lowerEnd),
      ...grid.slice(upperEnd, starts[lower]),
      ...grid.slice(starts[upper], upperEnd),
      ...grid.slice(lowerEnd),
    ],
    // Both ends of an arc live on the same row, so both travel the same way
    // and the pair stays in order.
    ties: ties.map((tie) => ({ ...tie, from: moveCol(tie.from), to: moveCol(tie.to) })),
    marks: marks.map((mark) => ({ ...mark, col: moveCol(mark.col) })),
    structure,
  }
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

  const at = rowStarts(rows)[rowIndex] + rowWidth(rows[rowIndex])
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
  const end = rowStarts(rows)[rowIndex] + rowWidth(rows[rowIndex])
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
export function shiftRow({ rows, grid, ties, marks, structure }, rowIndex, step, anchor = null) {
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
    structure,
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
  const { rows, grid, ties, marks, structure } = sheet
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
    structure,
  }
}

/* Copying a range ---------------------------------------------------------
 *
 * Copy mode picks out a stretch of positions on one staff line and writes it
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
  const { rows, grid, ties, marks, structure } = sheet
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
    structure,
  }
}

/** True when nothing has been written anywhere in the grid. */
export const isGridEmpty = (grid) =>
  grid.every((column) => column.every((cell) => cell === ''))

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
export function toAsciiTab({ grid, rows, ties = [], marks = [] }, tuning = STANDARD_TUNING) {
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
  { grid, rows, groups = createGroups(rows.length), ties = [], marks = [], structure = [], bpm = DEFAULT_BPM },
  tuning = STANDARD_TUNING,
  title = '',
) {
  // Every row is kept, blank ones included: rows are added by hand now, so the
  // file records the sheet as it was left rather than trimming it back.
  return JSON.stringify(
    {
      format: 'fretboard-notebook',
      version: 8,
      title,
      tuning,
      // Playback tempo, in beats per minute — one grid column per beat.
      bpm: clampBpm(bpm),
      // One bar count per staff row; rows can differ in length.
      rows,
      // One group id per staff row, in row order. A row's id is its name, so
      // reordering the rows reorders these with them.
      groups,
      // The running order: one slot per position in the song, holding the
      // group played there — as a bare id, or as `{ group, repeat }` where the
      // slot calls for it more than once. Null where nothing is set.
      structure: structure.map(writeGroupSlot),
      // Emitted high-string-first, the same order as `tuning`.
      columns: grid.slice(0, totalColumns(rows)),
      ties,
      marks,
    },
    null,
    2,
  )
}

/** Best-effort parse of a file written by `toJson`. Returns null when invalid. */
export function fromJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || !Array.isArray(data.columns) || data.columns.length > MAX_IMPORT_COLUMNS) {
    return null
  }

  const columns = data.columns
    .filter(Array.isArray)
    .map((column) =>
      Array.from({ length: STRING_COUNT }, (_, i) => normalizeCell(String(column[i] ?? ''))),
    )
  if (columns.length === 0) return null

  // Ties are dropped unless both ends land on a real note, so a hand-edited or
  // older file can never leave an arc hanging off nothing.
  const candidates = (Array.isArray(data.ties) ? data.ties : [])
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
  const marks = (Array.isArray(data.marks) ? data.marks : [])
    .filter(
      (mark) =>
        mark &&
        MARK_SYMBOLS.includes(mark.symbol) &&
        Number.isInteger(mark.string) &&
        Number.isInteger(mark.col) &&
        columns[mark.col]?.[mark.string],
    )
    .map(({ string, col, symbol }) => ({ string, col, symbol }))

  const rows = readRows(data.rows, columns.length)
  if (!rows) return null
  const groups = readGroups(data.groups, rows.length)
  return {
    title: typeof data.title === 'string' ? data.title : '',
    grid: columns,
    rows,
    groups,
    // A file written before live mode existed simply plays at the default.
    bpm: clampBpm(data.bpm),
    // A file written before groups existed simply has no running order.
    structure: clampStructure(Array.isArray(data.structure) ? data.structure : [], groups),
    ties,
    marks,
  }
}

/**
 * Group ids from a file, one per row. A file written before ids existed (version
 * 7 and earlier) had no way to reorder rows, so its rows were their own names:
 * ids counting from zero are exactly what its running order already refers to.
 * A short, damaged or duplicated list is topped up the same way rather than
 * leaving two rows answering to one name.
 */
function readGroups(raw, rowCount) {
  const kept = []
  const list = Array.isArray(raw) ? raw : []
  for (let i = 0; i < rowCount; i += 1) {
    const id = list[i]
    kept.push(Number.isInteger(id) && id >= 0 && !kept.includes(id) ? id : nextGroupId(kept))
  }
  return kept
}

/** Columns a staff line held before rows could differ in length. */
const LEGACY_COLS_PER_LINE = 32

/**
 * Row lengths from a file, or a set derived from its columns. Files written
 * before rows existed wrapped every 32 positions, so that is what their
 * columns are cut back into; a row count that does not cover the columns is
 * topped up rather than dropping what was written.
 */
function readRows(raw, columns) {
  const rawRows = Array.isArray(raw) ? raw : []
  if (rawRows.length > MAX_IMPORT_ROWS) return null

  const rows = rawRows
    .filter((bars) => Number.isInteger(bars) && bars > 0)
    .slice(0, columns)

  if (rows.some((bars) => bars > MAX_IMPORT_BARS_PER_ROW)) return null

  if (rows.length === 0) {
    const lines = Math.max(1, Math.ceil(columns / LEGACY_COLS_PER_LINE))
    const legacyRows = Array(lines).fill(LEGACY_COLS_PER_LINE / COLS_PER_BAR)
    return totalColumns(legacyRows) <= MAX_IMPORT_COLUMNS ? legacyRows : null
  }

  const short = columns - totalColumns(rows)
  if (short <= 0) return totalColumns(rows) <= MAX_IMPORT_COLUMNS ? rows : null

  const filled = [...rows, ...Array(Math.ceil(short / rowWidth(DEFAULT_BARS))).fill(DEFAULT_BARS)]
  return filled.length <= MAX_IMPORT_ROWS && totalColumns(filled) <= MAX_IMPORT_COLUMNS
    ? filled
    : null
}

/**
 * What a published note may be called. A note's file name is its URL, so the
 * name is held to the shape `slugify` produces — which is also what stops a
 * slug read off the address bar from being bent into a path of its own.
 */
export const NOTE_NAME = /^[a-z0-9][a-z0-9-]*$/

/** Filesystem-safe file stem derived from the user's title. */
export const slugify = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'fretboard-notebook'

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
