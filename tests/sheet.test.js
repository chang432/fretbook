import test from 'node:test'
import assert from 'node:assert/strict'
import { addTie, createSheet, fromJson, isEmpty, removeGroup, tieTargets, toJson } from '../src/utils/sheet.js'
import {
  GROUP_END,
  GROUP_REF,
  GROUP_START,
  Row,
  STANDARD_TUNING,
  markColumn,
  writeCell,
} from '../src/utils/tabV2.js'
import { songRuns, songBeats, hasSong } from '../src/utils/live.js'

/** A row with a group in it, a group played again, and something written. */
function sheet() {
  let rows = [new Row(12, null, 'Intro'), new Row(8, null, '')]
  rows = markColumn(rows, 0, 2, GROUP_START, { name: 'A' })
  rows = markColumn(rows, 0, 6, GROUP_END, { repeat: 3 })
  rows = markColumn(rows, 1, 1, GROUP_REF, { name: 'A', repeat: 2 })
  rows = writeCell(rows, 0, 3, 5, '0')
  rows = writeCell(rows, 0, 5, 5, '0')
  rows = writeCell(rows, 0, 4, 4, '12')
  rows = writeCell(rows, 1, 5, 2, '7')

  return {
    rows,
    ties: [{ row: 0, string: 5, from: 3, to: 5 }],
    marks: [{ row: 0, col: 4, string: 4, symbol: 'zigzag' }],
  }
}

test('a sheet survives being written to a file and read back', () => {
  const before = sheet()
  const json = toJson({ ...before, memo: 'drop D' }, STANDARD_TUNING, 'A song')
  assert.equal(JSON.parse(json).format, 'fretbook')
  const after = fromJson(json)

  assert.ok(after)
  assert.equal(after.title, 'A song')
  assert.equal(after.memo, 'drop D')
  assert.equal(toJson({ ...after }, STANDARD_TUNING, after.title), json, 'and again, byte for byte')
  assert.deepEqual(
    after.rows.map((row) => [row.name, row.length]),
    [['intro', 12], ['', 8]],
  )
  assert.deepEqual(
    after.rows[0].groups.map(({ start, end, name, repeat }) => [start, end, name, repeat]),
    [[2, 6, 'A', 3]],
  )
  assert.equal(after.rows[1].column(1).name, 'A', 'the group played on the second row')
  assert.equal(after.rows[1].column(1).repeat, 2)
  assert.equal(after.rows[0].column(3).cell(5).value, '0')
  assert.deepEqual(after.ties, before.ties)
  assert.deepEqual(after.marks, before.marks)
})

test('nothing but the current format is read', () => {
  assert.equal(fromJson('not json at all'), null)
  assert.equal(fromJson('{}'), null)
  assert.equal(
    fromJson(JSON.stringify({ format: 'fretboard-notebook', version: 13, rows: [] })),
    null,
    'the first editor’s files are not read',
  )
})

test('a file cannot describe a group the model would refuse', () => {
  const json = JSON.stringify({
    format: 'fretbook',
    version: 14,
    title: '',
    tuning: STANDARD_TUNING,
    memo: '',
    rows: [
      {
        name: '',
        length: 4,
        columns: [['', '', '', '', '', ''], ['', '', '', '', '', '99'], [], []],
        // Backwards, and past the end of the row.
        groups: [{ start: 3, end: 1, name: 'A', repeat: 2 }, { start: 0, end: 40 }],
        refs: [{ at: 99, name: 'B' }],
      },
    ],
    ties: [{ row: 7, string: 0, from: 0, to: 1 }],
    marks: [{ row: 0, col: 0, string: 0, symbol: 'not-a-symbol' }],
  })

  const read = fromJson(json)
  assert.ok(read)
  assert.equal(read.rows[0].groups.length, 0, 'neither group was taken')
  assert.ok(read.rows[0].columns.every((column) => !column.isGroupRef), 'nor the reference')
  assert.equal(read.rows[0].column(1).cell(5).value, '', 'a fret past the neck is not written')
  assert.deepEqual(read.ties, [], 'a tie on a row that does not exist is dropped')
  assert.deepEqual(read.marks, [], 'and a symbol nobody draws')
})

test('a blank sheet is one empty row', () => {
  const blank = createSheet()
  assert.equal(blank.rows.length, 1)
  assert.ok(isEmpty(blank.rows))
  assert.equal(hasSong(blank.rows), true, 'it has positions, they are simply empty')
})

test('the player repeats a group, and plays one written elsewhere', () => {
  const runs = songRuns(sheet().rows)

  assert.deepEqual(
    runs.map(({ row, from, to, pass, passes }) => [row, from, to, `${pass}/${passes}`]),
    [
      [0, 0, 1, '1/1'],
      [0, 3, 5, '1/3'],
      [0, 3, 5, '2/3'],
      [0, 3, 5, '3/3'],
      [0, 7, 11, '1/1'],
      [1, 0, 0, '1/1'],
      [0, 3, 5, '1/2'],
      [0, 3, 5, '2/2'],
      [1, 2, 7, '1/1'],
    ],
  )
  assert.equal(songBeats(runs), 2 + 3 * 3 + 5 + 1 + 3 * 2 + 6)
})

/** A file with one row of the given columns, groups, refs and annotations. */
const file = ({ columns, groups = [], refs = [], ties = [], marks = [] }) =>
  JSON.stringify({
    format: 'fretbook',
    version: 14,
    title: '',
    tuning: STANDARD_TUNING,
    memo: '',
    rows: [{ name: '', length: columns.length, columns, groups, refs }],
    ties,
    marks,
  })

const blank = (n) => Array.from({ length: n }, () => ['', '', '', '', '', ''])

test('a file cannot overlap or nest groups, or put a ref on one', () => {
  const read = fromJson(file({
    columns: blank(10),
    groups: [{ start: 0, end: 5, name: 'A' }, { start: 2, end: 3, name: 'B' }, { start: 5, end: 8, name: 'C' }],
    refs: [{ at: 0, name: 'D' }, { at: 3, name: 'D' }, { at: 9, name: 'D' }],
  }))

  assert.deepEqual(read.rows[0].groups.map(({ start, end, name }) => [start, end, name]), [[0, 5, 'A']])
  assert.equal(read.rows[0].groupEdges.length, 2, 'no orphaned ends are left behind')
  assert.deepEqual(read.rows[0].columns.filter((c) => c.isGroupRef).map((c) => c.rowPosition), [9])
})

test('a file’s arcs and symbols must hang off a written note', () => {
  const columns = blank(4)
  columns[1][2] = '3'
  columns[2][2] = '5'
  const read = fromJson(file({
    columns,
    ties: [
      { row: 0, string: 2, from: 1, to: 2 },
      { row: -1, string: 2, from: 1, to: 2 },
      { row: 0, string: 2, from: 2, to: 1 },
      { row: 0, string: 9, from: 1, to: 2 },
      { row: 0, string: 2, from: 1, to: 3 },
      { row: 0, string: 2, from: 1, to: 40 },
    ],
    marks: [
      { row: 0, col: 1, string: 2, symbol: 'zigzag' },
      { row: 0, col: 0, string: 2, symbol: 'zigzag' },
      { row: 0, col: 99, string: 2, symbol: 'zigzag' },
      { row: 0, col: 1, string: -1, symbol: 'zigzag' },
    ],
  }))

  assert.deepEqual(read.ties, [{ row: 0, string: 2, from: 1, to: 2 }])
  assert.deepEqual(read.marks, [{ row: 0, col: 1, string: 2, symbol: 'zigzag' }])
})

test('deleting a group keeps every arc and symbol it did not stand on', () => {
  const before = sheet()
  // Something on the second row, which the group never touches, and on the
  // first row past the group's closing column.
  before.rows = writeCell(before.rows, 0, 8, 0, '1')
  before.marks.push({ row: 1, col: 5, string: 2, symbol: 'zigzag' }, { row: 0, col: 8, string: 0, symbol: 'zigzag' })

  const after = removeGroup(before, 0, 2)

  assert.equal(after.rows[0].groups.length, 0)
  assert.equal(after.rows[1].column(1).isGroupRef, false, 'the place it was played is gone too')
  assert.deepEqual(after.ties, [{ row: 0, string: 5, from: 2, to: 4 }], 'slid one closer past the opening')
  assert.deepEqual(after.marks, [
    { row: 0, col: 3, string: 4, symbol: 'zigzag' },
    { row: 1, col: 5, string: 2, symbol: 'zigzag' },
    { row: 0, col: 6, string: 0, symbol: 'zigzag' },
  ])
  assert.equal(after.rows[0].column(6).cell(0).value, '1', 'and still on its note')
  assert.equal(removeGroup(before, 0, 3), before, 'no group opens there: nothing changes')
})


test('curve targets extend past notes and group markers across the row', () => {
  let rows = [new Row(7)]
  rows = writeCell(rows, 0, 1, 0, '3')
  rows = writeCell(rows, 0, 2, 0, '5')
  rows = markColumn(rows, 0, 3, GROUP_START, { name: 'A' })
  rows = markColumn(rows, 0, 5, GROUP_END, { repeat: 1 })
  assert.deepEqual(tieTargets(rows[0], 1), [0, 2, 4, 6])
})

test('a note can join curves on both sides and a same-side curve is replaced', () => {
  let ties = addTie([], 0, 0, 0, 2)
  ties = addTie(ties, 0, 0, 2, 4)
  assert.deepEqual(ties, [{ row: 0, string: 0, from: 0, to: 2 }, { row: 0, string: 0, from: 2, to: 4 }])
  ties = addTie(ties, 0, 0, 2, 5)
  assert.deepEqual(ties, [{ row: 0, string: 0, from: 0, to: 2 }, { row: 0, string: 0, from: 2, to: 5 }])
})
