/**
 * A whole sheet, and the file it is saved as.
 *
 * The music itself is utils/tabV2.js — an array of Rows, each its own run of
 * Columns. This is everything around that: the note written at the top, the
 * arcs and symbols drawn over the staves, and the reading and writing of the
 * one file format the editor keeps.
 *
 *   sheet  →  { rows, ties, marks }
 *   file   →  that, plus a title and a tuning
 *
 * There is no arrangement and there are no groups of rows. A sheet is its
 * rows, top to bottom, and the only thing that says a passage is played more
 * than once is a group marked inside a staff — see utils/column.js.
 */
import { MAX_FRET, STRING_COUNT } from './cell.js'
import {
  DEFAULT_GROUP_NAME,
  DEFAULT_ROW_LENGTH,
  GROUP_END,
  GROUP_REF,
  GROUP_START,
  Row,
  STANDARD_TUNING,
  deleteGroup,
  markColumn,
  normalizeGroupName,
  normalizeRepeat,
  writeCell,
} from './tabV2.js'

/** The version of the file format. Anything else is refused outright. */
const SHEET_VERSION = 14

/** Rows a file may hold, and positions a row may hold, before it is refused. */
const MAX_ROWS = 400
const MAX_COLUMNS = 4000

/**
 * The note written at the top of a sheet: prose about the song — a tuning, a
 * capo, what to listen for. One string belonging to the whole sheet, so it
 * needs no shaping beyond a limit: long enough for a few paragraphs, short
 * enough that a pasted book cannot arrive through a file.
 */
export const MAX_MEMO = 4000

/** A memo from a file, cut to the limit. Anything else reads as none. */
export const readMemo = (raw) => (typeof raw === 'string' ? raw.slice(0, MAX_MEMO) : '')

/* Curves between notes --------------------------------------------------- */

/** Writable positions up to the nearest group edge in either direction. */
export function tieTargets(row, col) {
  if (!row?.column(col) || row.column(col).isGroupMark) return []
  const targets = []
  for (const step of [-1, 1]) {
    for (let at = col + step; at >= 0 && at < row.length; at += step) {
      const column = row.column(at)
      if (column.isGroupEdge) break
      if (!column.isGroupMark) targets.push(at)
    }
  }
  return targets
}

/** Keep one curve on each side of a note, replacing a curve on the same side. */
export function addTie(ties, row, string, from, to) {
  return [
    ...ties.filter((tie) => tie.row !== row || tie.string !== string || (tie.from !== from && tie.to !== to)),
    { row, string, from, to },
  ]
}

/* Symbols over a note ----------------------------------------------------- */

export const MARK_ZIGZAG = 'zigzag'
export const MARK_SYMBOLS = [MARK_ZIGZAG]

/** The symbol sitting above a note, or null. */
export const markAt = (marks, row, col, string) =>
  marks.find((mark) => mark.row === row && mark.col === col && mark.string === string)?.symbol ??
  null

/** Apply a symbol to a note; applying the one already there removes it. */
export function toggleMark(marks, row, col, string, symbol) {
  const kept = marks.filter(
    (mark) => !(mark.row === row && mark.col === col && mark.string === string),
  )
  return markAt(marks, row, col, string) === symbol ? kept : [...kept, { row, col, string, symbol }]
}

/**
 * Move every arc and symbol to where its position now stands. `place(row,
 * col)` answers with the new column, or null when that position is gone —
 * and an arc loses both ends with either one.
 */
export function remapAnnotations({ ties, marks }, place) {
  return {
    ties: ties.flatMap((tie) => {
      const from = place(tie.row, tie.from)
      const to = place(tie.row, tie.to)
      return from === null || to === null ? [] : [{ ...tie, from, to }]
    }),
    marks: marks.flatMap((mark) => {
      const col = place(mark.row, mark.col)
      return col === null ? [] : [{ ...mark, col }]
    }),
  }
}

/* The sheet --------------------------------------------------------------- */

/** A blank sheet: one row of the length every row starts at. */
export const createSheet = () => ({ rows: [new Row()], ties: [], marks: [] })

/**
 * Take the group opening at `col` off the sheet, with the arcs and symbols
 * kept where they were. Hands back the same sheet when there is no such group.
 *
 * Only two things move: in the group's own row its two ends come out, so
 * everything past each end slides one closer; and every place the group was
 * played becomes an empty position where it stood, so anything held on one
 * goes. Every other row's annotations are left alone.
 */
export function removeGroup(sheet, row, col) {
  const group = sheet.rows[row]?.groups.find((each) => each.start === col)
  if (!group) return sheet

  const rows = deleteGroup(sheet.rows, row, col)
  if (rows === sheet.rows) return sheet

  const name = group.name ?? DEFAULT_GROUP_NAME
  const place = (r, c) => {
    const column = sheet.rows[r]?.column(c)
    if (!column || (column.isGroupRef && column.name === name)) return null
    if (r !== row) return c
    if (c === group.start || c === group.end) return null
    return c - (c > group.start ? 1 : 0) - (c > group.end ? 1 : 0)
  }

  return { ...sheet, rows, ...remapAnnotations(sheet, place) }
}

/** True when there is not a single fret written anywhere on the sheet. */
export const isEmpty = (rows) => rows.every((row) => row.isEmpty)

/**
 * Every group written anywhere, by name. What a column standing in for a
 * group played elsewhere is pointing at — the name is the whole of the link
 * between the two, so a sheet with two groups of one name has one group as
 * far as anything reading it is concerned.
 */
export function groupsByName(rows) {
  const found = new Map()

  rows.forEach((row, at) => {
    row.groups.forEach((group) => {
      if (!found.has(group.name)) found.set(group.name, { ...group, row: at })
    })
  })

  return found
}

/* Reading and writing the file -------------------------------------------- */

/**
 * The sheet as JSON, which is both the export and what the browser keeps.
 *
 * A row is written as the frets in it and, separately, the groups marked in
 * it — rather than as a run of columns each carrying its own mode — because
 * that is what a reader of the file would want to see: the music, and then
 * what is said about it. Reading it back marks the columns again, so the
 * file cannot describe a group the model would not allow.
 */
export function toJson({ rows, ties, marks, memo }, tuning = STANDARD_TUNING, title = '') {
  return JSON.stringify(
    {
      format: 'fretbook',
      version: SHEET_VERSION,
      title,
      tuning,
      memo: readMemo(memo),
      rows: rows.map((row) => ({
        name: row.name,
        length: row.length,
        // One array per position, high string first, the same order as
        // `tuning`. Written in full, blanks included, so a position is found
        // by counting rather than by looking anything up.
        columns: row.columns.map((column) => column.cells.map((cell) => cell.value)),
        // Where the staff is bracketed, and how many times each bracket is
        // played. Read off the columns rather than held beside them, so the
        // file cannot disagree with the staff it describes.
        groups: row.groups.map(({ start, end, name, repeat }) => ({
          start,
          end,
          name,
          repeat: repeat ?? 1,
        })),
        // And where a group written elsewhere is played.
        refs: row.columns
          .filter((column) => column.isGroupRef)
          .map((column) => ({
            at: column.rowPosition,
            name: column.name,
            repeat: column.repeat ?? 1,
          })),
      })),
      ties,
      marks,
    },
    null,
    2,
  )
}

/** One fret from a file: a number within reach, or nothing. */
const readValue = (raw) => {
  if (typeof raw !== 'string') return ''
  if (raw.trim().toLowerCase() === 'x') return 'x'
  const digits = raw.replace(/\D/g, '').slice(0, 2)
  if (digits === '') return ''
  return Number(digits) > MAX_FRET ? '' : String(Number(digits))
}

/** Whole numbers only, and within the row they are said to be in. */
const inRow = (at, length) => Number.isInteger(at) && at >= 0 && at < length

/**
 * Parse the current sheet format, or null when it is not one.
 *
 * Nothing is trusted: the rows are built through the model a cell and a mark
 * at a time, so a file describing a group that runs backwards, or a fret
 * beyond the end of the neck, yields a sheet without it rather than a sheet
 * that cannot be drawn.
 */
export function fromJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (
    !data ||
    data.format !== 'fretbook' ||
    data.version !== SHEET_VERSION ||
    typeof data.title !== 'string' ||
    typeof data.memo !== 'string' ||
    !Array.isArray(data.tuning) ||
    !Array.isArray(data.rows) ||
    data.rows.length === 0 ||
    data.rows.length > MAX_ROWS ||
    !Array.isArray(data.ties) ||
    !Array.isArray(data.marks)
  ) {
    return null
  }

  let rows = []

  for (const raw of data.rows) {
    if (!raw || !Array.isArray(raw.columns) || raw.columns.length > MAX_COLUMNS) return null

    const length = raw.columns.length || DEFAULT_ROW_LENGTH
    rows.push(new Row(length, null, typeof raw.name === 'string' ? raw.name.slice(0, 40) : ''))
    const at = rows.length - 1

    raw.columns.forEach((column, col) => {
      if (!Array.isArray(column)) return
      column.slice(0, STRING_COUNT).forEach((value, string) => {
        const fret = readValue(value)
        if (fret !== '') rows = writeCell(rows, at, col, string, fret)
      })
    })

    // The brackets, then the places a group is played: both are marks on
    // columns that already exist, so a position outside the row is dropped
    // rather than stretching it.
    if (Array.isArray(raw.groups)) {
      for (const group of raw.groups) {
        if (!group || !inRow(group.start, length) || !inRow(group.end, length)) continue
        if (group.end <= group.start) continue
        // Groups neither overlap nor nest: a span holding any group mark, or
        // sitting inside a group already read, would leave orphaned ends the
        // editor can neither read nor delete, so the later group is dropped.
        const span = rows[at].columns.slice(group.start, group.end + 1)
        if (span.some((column) => column.isGroupMark) || rows[at].groupAt(group.start)) continue
        rows = markColumn(rows, at, group.start, GROUP_START, {
          name: normalizeGroupName(group.name),
        })
        rows = markColumn(rows, at, group.end, GROUP_END, { repeat: normalizeRepeat(group.repeat) })
      }
    }

    if (Array.isArray(raw.refs)) {
      for (const ref of raw.refs) {
        if (!ref || !inRow(ref.at, length)) continue
        // Same rule as `Row.withGroupAt`: never on a group's ends, never
        // inside one, and never over another ref.
        if (rows[at].column(ref.at).isGroupMark || rows[at].groupAt(ref.at)) continue
        rows = markColumn(rows, at, ref.at, GROUP_REF, {
          name: normalizeGroupName(ref.name),
          repeat: normalizeRepeat(ref.repeat),
        })
      }
    }
  }

  // An arc or symbol hangs off a written note on a plain position, so each
  // anchor must name a real row, column and string with something on it.
  // Anything else would be drawn at an undefined offset and then carried
  // along by every later edit.
  const holdsNote = (row, col, string) => {
    if (!Number.isInteger(row) || !Number.isInteger(col) || !Number.isInteger(string)) return false
    if (string < 0 || string >= STRING_COUNT) return false
    const column = rows[row]?.column(col)
    return Boolean(column) && !column.isGroupMark && !column.cell(string).isEmpty
  }

  const ties = data.ties.filter(
    (tie) =>
      tie &&
      tie.from < tie.to &&
      holdsNote(tie.row, tie.from, tie.string) &&
      holdsNote(tie.row, tie.to, tie.string),
  )

  const marks = data.marks.filter(
    (mark) =>
      mark && MARK_SYMBOLS.includes(mark.symbol) && holdsNote(mark.row, mark.col, mark.string),
  )

  return { rows, ties, marks, title: data.title, memo: readMemo(data.memo) }
}
