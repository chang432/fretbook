import test from 'node:test'
import assert from 'node:assert/strict'
import { addGroup, addRowToGroup, createSheet, fromJson, moveNode, removeGroup, rowsInGroup, swapRows, toJson } from '../src/utils/tab.js'
import { songRuns } from '../src/utils/live.js'

function nested() {
  let sheet = createSheet()
  sheet.groups = addGroup(sheet.groups)
  sheet.structure.push({ groupId: 1, children: [] })
  sheet = { ...sheet, ...addRowToGroup(sheet, 1) }
  sheet.grid[0][0] = '3'
  sheet.grid[16][0] = '5'
  sheet = { ...sheet, ...moveNode(sheet, 'groupId', 1, 0, 1), arrangement: [0, 1, 0] }
  return sheet
}

test('nested sheets round trip and reject old and invalid formats', () => {
  const sheet = nested()
  const json = JSON.parse(toJson(sheet))
  assert.deepEqual(fromJson(JSON.stringify(json)).structure, sheet.structure)
  assert.equal(fromJson(JSON.stringify({ ...json, version: 12 })), null)
  assert.equal(fromJson(JSON.stringify({ ...json, structure: [...json.structure, { rowId: sheet.rowIds[0] }] })), null)
  assert.equal(fromJson(JSON.stringify({ ...json, arrangement: undefined })), null)
  let deep = { rowId: sheet.rowIds[0] }
  const groups = Array.from({ length: 9 }, (_, id) => ({ id, name: '' }))
  for (let id = 8; id >= 0; id -= 1) deep = { groupId: id, children: [deep] }
  assert.equal(fromJson(JSON.stringify({ ...json, rows: [4], rowIds: [sheet.rowIds[0]], columns: json.columns.slice(0, 16), groups, structure: [deep], arrangement: [] })), null)
})

test('move, swap and playback preserve subtree order and row contents', () => {
  let sheet = nested()
  assert.deepEqual(rowsInGroup(sheet.structure, sheet.rowIds, 0), [0, 1])
  assert.equal(moveNode(sheet, 'groupId', 0, 1, 0), null)
  assert.deepEqual(songRuns(sheet).map((run) => run.row), [0, 1, 1, 0, 1])
  sheet = { ...sheet, ...swapRows(sheet, 0, 1) }
  assert.equal(sheet.grid[0][0], '5')
  assert.equal(sheet.grid[16][0], '3')
  assert.deepEqual(fromJson(toJson(sheet)).rowIds, sheet.rowIds)
  sheet = { ...sheet, ...moveNode(sheet, 'groupId', 1, null, 0) }
  assert.deepEqual(fromJson(toJson(sheet)).structure, sheet.structure)
})

test('deletion removes descendants and leaves a blank row when necessary', () => {
  const sheet = nested()
  const remaining = removeGroup(sheet, 1)
  assert.deepEqual(remaining.groups.map((group) => group.id), [0])
  assert.deepEqual(remaining.arrangement, [0, 0])
  assert.equal(remaining.grid[0][0], '3')
  const empty = removeGroup(sheet, 0)
  assert.deepEqual(empty.groups, [])
  assert.deepEqual(empty.arrangement, [])
  assert.equal(empty.rows.length, 1)
  assert.ok(empty.grid.every((col) => col.every((cell) => !cell)))
  assert.ok(fromJson(toJson(empty)))
})

test('moving and deleting rows carries or removes their annotations', () => {
  let sheet = nested()
  sheet.grid[1][0] = '3'
  sheet.grid[17][0] = '5'
  sheet.ties = [{ string: 0, from: 0, to: 1 }, { string: 0, from: 16, to: 17 }]
  sheet.marks = [{ string: 0, col: 0, symbol: 'zigzag' }, { string: 0, col: 16, symbol: 'zigzag' }]
  sheet = { ...sheet, ...moveNode(sheet, 'groupId', 1, null, 0) }
  assert.deepEqual(sheet.ties.map((tie) => [tie.from, tie.to]), [[16, 17], [0, 1]])
  assert.deepEqual(sheet.marks.map((mark) => mark.col), [16, 0])
  const remaining = removeGroup(sheet, 1)
  assert.deepEqual(remaining.ties.map((tie) => [tie.from, tie.to]), [[0, 1]])
  assert.deepEqual(remaining.marks.map((mark) => mark.col), [0])
})

test('empty groups have a stable position and add no playback', () => {
  const sheet = nested()
  sheet.groups = addGroup(sheet.groups)
  sheet.structure.unshift({ groupId: 2, children: [] })
  sheet.arrangement.unshift(2)
  assert.deepEqual(fromJson(toJson(sheet)).structure, sheet.structure)
  assert.equal(songRuns(sheet).length, 5)
})
