import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROUP_END,
  GROUP_START,
  Row,
  cancelGroup,
  deleteColumn,
  deleteGroup,
  deleteRef,
  endGroup,
  markColumn,
  nameGroup,
  nextGroupName,
  placeGroup,
  startGroup,
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

test('a new group is opened before a position, pushing it inside', () => {
  const rows = sheet()
  // Position 12 holds a note and stands clear of the group already there.
  const opened = startGroup(rows, 0, 12)

  assert.equal(opened[0].length, 17, 'the opening is a column of its own')
  assert.equal(opened[0].column(12).cssMode, GROUP_START)
  assert.equal(opened[0].column(13).cell(2).value, '9', 'the position it opened before moved along')
  assert.equal(opened[0].groups.length, 1, 'an opening with no end is not a group yet')
})

test('a new group is named for what the sheet has not used', () => {
  const rows = sheet()
  assert.equal(nextGroupName(rows), 'B', 'A is taken')
  assert.equal(startGroup(rows, 0, 1)[0].column(1).name, 'B')

  const two = startGroup(rows, 0, 1)
  const closed = endGroup(two, 0, 1, 2)
  assert.equal(nextGroupName(closed), 'C', 'and now B is too')
})

test('closing a group puts its end just past the position pressed', () => {
  const opened = startGroup(sheet(), 0, 1)
  const closed = endGroup(opened, 0, 1, 3)

  assert.equal(closed[0].length, 18, 'both ends are columns of their own')
  assert.deepEqual(
    closed[0].groups.map(({ start, end, name, repeat }) => [start, end, name, repeat]),
    [[1, 4, 'B', 1], [6, 10, 'A', 3]],
    'the new group ends after the position pressed, and counts once',
  )
})

test('a group cannot be closed across another group', () => {
  const opened = startGroup(sheet(), 0, 1)

  assert.deepEqual(opened[0].closersFor(1), [2, 3, 4], 'the run stops at the next group')
  assert.equal(endGroup(opened, 0, 1, 8), opened, 'past that is refused')
  assert.equal(endGroup(opened, 0, 1, 1), opened, 'and so is the opening itself')
})

test('an opening nobody closed comes back out', () => {
  const rows = sheet()
  const opened = startGroup(rows, 0, 12)
  const back = cancelGroup(opened, 0, 12)

  assert.equal(back[0].length, rows[0].length)
  assert.deepEqual(
    back[0].columns.map((column) => column.cssMode),
    rows[0].columns.map((column) => column.cssMode),
  )
  assert.equal(back[0].column(12).cell(2).value, '9', 'and the position it moved is back')
})

test('only an opening comes back out that way', () => {
  const rows = sheet()

  assert.equal(cancelGroup(rows, 0, 8), rows, 'not a closing')
  assert.equal(cancelGroup(rows, 0, 1), rows, 'not a plain position')
})

test('a position comes off the row, and the rest move one closer', () => {
  const rows = sheet()
  const cut = deleteColumn(rows, 0, 2)

  assert.equal(cut[0].length, 15)
  assert.deepEqual(
    cut[0].columns.map((column) => column.rowPosition),
    [...Array(15).keys()],
    'the positions are renumbered with no gap',
  )
  assert.deepEqual(
    cut[0].groups.map(({ start, end }) => [start, end]),
    [[3, 7]],
    'the group past it moves along whole',
  )
  assert.equal(cut[0].column(5).cell(2).value, '7', 'and the note inside it with it')
})

test('a position inside a group comes off, leaving the group shorter', () => {
  const rows = sheet()
  const cut = deleteColumn(rows, 0, 6)

  assert.deepEqual(cut[0].groups.map(({ start, end }) => [start, end]), [[4, 7]])
  assert.equal(cut[0].column(6).cell(2).isEmpty !== false, true, 'the note went with it')
})

test('only a plain position comes off that way', () => {
  const rows = placeGroup(sheet(), 0, 1, 'A')

  for (const [col, what] of [[1, 'a group played here'], [4, 'an opening'], [8, 'a closing']]) {
    assert.equal(deleteColumn(rows, 0, col), rows, what)
  }
})

test('the last position standing is kept', () => {
  const one = [new Row(1, null, 'Just the one')]

  assert.equal(deleteColumn(one, 0, 0), one)
})
