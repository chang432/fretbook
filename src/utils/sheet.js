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
  DEFAULT_ROW_LENGTH,
  GROUP_END,
  GROUP_REF,
  GROUP_START,
  Row,
  STANDARD_TUNING,
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

/* Symbols over a note ----------------------------------------------------- */

export const MARK_ZIGZAG = 'zigzag'
export const MARK_SYMBOLS = [MARK_ZIGZAG]

/** Letter appended to the fret in ASCII exports, which cannot draw a symbol. */
export const MARK_ASCII = { [MARK_ZIGZAG]: 'w' }

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

/* The sheet --------------------------------------------------------------- */

/** A blank sheet: one row of the length every row starts at. */
export const createSheet = () => ({ rows: [new Row()], ties: [], marks: [] })

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
      format: 'fretboard-notebook',
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
    data.format !== 'fretboard-notebook' ||
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
        rows = markColumn(rows, at, group.start, GROUP_START, {
          name: normalizeGroupName(group.name),
        })
        rows = markColumn(rows, at, group.end, GROUP_END, { repeat: normalizeRepeat(group.repeat) })
      }
    }

    if (Array.isArray(raw.refs)) {
      for (const ref of raw.refs) {
        if (!ref || !inRow(ref.at, length)) continue
        rows = markColumn(rows, at, ref.at, GROUP_REF, {
          name: normalizeGroupName(ref.name),
          repeat: normalizeRepeat(ref.repeat),
        })
      }
    }
  }

  const ties = data.ties.filter(
    (tie) =>
      tie &&
      Number.isInteger(tie.row) &&
      tie.row < rows.length &&
      Number.isInteger(tie.string) &&
      Number.isInteger(tie.from) &&
      Number.isInteger(tie.to),
  )

  const marks = data.marks.filter(
    (mark) =>
      mark &&
      Number.isInteger(mark.row) &&
      mark.row < rows.length &&
      Number.isInteger(mark.col) &&
      Number.isInteger(mark.string) &&
      MARK_SYMBOLS.includes(mark.symbol),
  )

  return { rows, ties, marks, title: data.title, memo: readMemo(data.memo) }
}

/* The sheet as text ------------------------------------------------------- */

/**
 * The sheet as ASCII tab: one block per row, strings high to low.
 *
 * A group's two ends are drawn as repeat barlines, the way they would be in
 * printed tab, and how many times it is played is written above the line
 * that closes it. A column standing in for a group played elsewhere carries
 * that group's name between the two barlines.
 */
export function toAsciiTab({ rows, ties, marks }, tuning = STANDARD_TUNING) {
  const blocks = rows.map((row, at) => {
    // What each position is drawn as, which settles how wide it has to be
    // before any of it is written out.
    const tokens = row.columns.map((column) => {
      if (column.cssMode === GROUP_START) return '|:'
      if (column.cssMode === GROUP_END) return ':|'
      if (column.isGroupRef) return `:${column.name}:`
      return null
    })

    const widths = row.columns.map((column, col) => {
      if (tokens[col]) return tokens[col].length
      return Math.max(
        1,
        ...column.cells.map((cell) => {
          if (cell.isEmpty) return 1
          const symbol = markAt(marks, at, col, cell.string)
          return cell.value.length + (symbol ? MARK_ASCII[symbol].length : 0)
        }),
      )
    })

    // Where each position starts along the line, so the counts above and the
    // arcs below can be written over the right one.
    const offsets = []
    let cursor = 0
    row.columns.forEach((_, col) => {
      if (col > 0) cursor += 1
      offsets.push(cursor)
      cursor += widths[col]
    })
    const span = cursor

    const lines = tuning.map((label, string) => {
      let body = ''
      row.columns.forEach((column, col) => {
        if (col > 0) body += '-'
        const cell = column.cell(string)
        const symbol = cell.isEmpty ? null : markAt(marks, at, col, string)
        const token =
          tokens[col] ?? (cell.isEmpty ? '-' : cell.value + (symbol ? MARK_ASCII[symbol] : ''))
        body += token.padEnd(widths[col], tokens[col] ? ':' : '-')
      })

      const chars = body.split('')
      ties
        .filter((tie) => tie.row === at && tie.string === string)
        .forEach((tie) => {
          const from = offsets[tie.from] + widths[tie.from]
          const to = offsets[tie.to] - 1
          for (let i = from; i <= to && i < chars.length; i += 1) {
            if (chars[i] === '-') chars[i] = '~'
          }
        })

      return `${label}|-${chars.join('')}-|`
    })

    // How many times each group is played, written over the barline that
    // closes it — there being nowhere on a string line to put it.
    const counts = Array(span).fill(' ')
    row.groups.forEach(({ end, repeat }) => {
      const say = `x${repeat ?? 1}`
      for (let i = 0; i < say.length && offsets[end] + i < span; i += 1) {
        counts[offsets[end] + i] = say[i]
      }
    })
    row.columns
      .filter((column) => column.isGroupRef)
      .forEach((column) => {
        const say = `x${column.repeat ?? 1}`
        for (let i = 0; i < say.length && offsets[column.rowPosition] + i < span; i += 1) {
          counts[offsets[column.rowPosition] + i] = say[i]
        }
      })

    // Three spaces to clear the `e|-` every string line opens with, so a
    // count stands over the barline it belongs to.
    const over = counts.join('').trimEnd()

    return [...(row.name ? [row.name] : []), ...(over ? [`   ${over}`] : []), ...lines].join('\n')
  })

  return blocks.join('\n\n') + '\n'
}
