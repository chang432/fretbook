import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROUP_END,
  GROUP_START,
  Row,
  deleteGroup,
  deleteRef,
  markColumn,
  nameGroup,
  placeGroup,
  writeCell,
} from '../src/utils/tabV2.js'

/**
 * One row, sixteen positions, holding group A from 4 to 8 played three
 * times, with a note inside the group and one outside it.
 */
function sheet() {
  let rows = [new Row(16, null, 'Intro')]
  rows = markColumn(rows, 0, 4, GROUP_START, { name: 'A' })
  rows = markColumn(rows, 0, 8, GROUP_END, { repeat: 3 })
  rows = writeCell(rows, 0, 6, 2, '7')
  rows = writeCell(rows, 0, 12, 2, '9')
  return rows
}

const refs = (rows) =>
  rows.flatMap((row, at) =>
    row.columns.filter((column) => column.isGroupRef).map((column) => [at, column.rowPosition]),
  )

test('a group can be played at a position of its own', () => {
  const rows = sheet()
  const played = placeGroup(rows, 0, 1, 'A')

  assert.deepEqual(refs(played), [[0, 1]])
  assert.equal(played[0].length, rows[0].length, 'the row keeps its length')
  assert.equal(played[0].column(1).name, 'A')
  assert.equal(played[0].column(1).repeat, 1)
})

test('a group cannot be played inside a group', () => {
  const rows = sheet()

  for (const col of [4, 5, 6, 7, 8]) {
    assert.equal(placeGroup(rows, 0, col, 'A'), rows, `position ${col} is inside the group`)
  }
})

test('the positions either side of a group still take one', () => {
  const rows = sheet()

  assert.deepEqual(refs(placeGroup(rows, 0, 3, 'A')), [[0, 3]], 'just before it')
  assert.deepEqual(refs(placeGroup(rows, 0, 9, 'A')), [[0, 9]], 'just after it')
})

test('nothing inside a group is lost to a refused placing', () => {
  const rows = sheet()
  const after = placeGroup(rows, 0, 6, 'A')

  assert.equal(after[0].column(6).cell(2).value, '7', 'the note is still written')
  assert.equal(after[0].groups.length, 1)
})

test('renaming a group renames everywhere it is played, and costs it nothing', () => {
  let rows = placeGroup(sheet(), 0, 1, 'A')
  rows = markColumn(rows, 0, 1, rows[0].column(1).cssMode, { name: 'A', repeat: 5 })

  const renamed = nameGroup(rows, 0, 4, 'Z')

  assert.equal(renamed[0].groups[0].name, 'Z')
  assert.equal(renamed[0].column(1).name, 'Z', 'the place it is played follows')
  assert.equal(renamed[0].column(1).repeat, 5, 'and keeps its own count')
})

test('deleting a group takes every place it is played with it', () => {
  const rows = placeGroup(sheet(), 0, 1, 'A')
  const gone = deleteGroup(rows, 0, 4)

  assert.deepEqual(refs(gone), [])
  assert.equal(gone[0].groups.length, 0)
  assert.equal(gone[0].length, 14, 'the group’s two columns are gone')
  // The note stood at 6, with the opening column ahead of it: one position
  // comes out before it, so it stands at 5 once the group is gone.
  assert.equal(gone[0].column(5).cell(2).value, '7', 'the music inside it stays')
  assert.equal(gone[0].column(10).cell(2).value, '9', 'and what stood after it')
})

test('deleting one place a group is played leaves the group alone', () => {
  const rows = placeGroup(sheet(), 0, 1, 'A')
  const gone = deleteRef(rows, 0, 1)

  assert.deepEqual(refs(gone), [])
  assert.equal(gone[0].groups.length, 1)
  assert.equal(gone[0].length, 16, 'the row is the length it started at')
  assert.ok(gone[0].column(1).isEmpty)
})
