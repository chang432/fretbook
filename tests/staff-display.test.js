import test from 'node:test'
import assert from 'node:assert/strict'
import { Row, GROUP_START, GROUP_END, GROUP_REF, markColumn, sheetGroups, writeCell } from '../src/utils/tabV2.js'
import { staffDisplay } from '../src/utils/staffDisplay.js'

test('expanded references insert source notes without changing saved positions', () => {
  let rows = [new Row(5), new Row(4)]
  rows = markColumn(rows, 0, 0, GROUP_START, { name: 'A' })
  rows = markColumn(rows, 0, 3, GROUP_END, { repeat: 1 })
  rows = writeCell(rows, 0, 1, 0, '7')
  rows = markColumn(rows, 1, 1, GROUP_REF, { name: 'A', repeat: 1 })
  const ref = rows[1].column(1)
  const display = staffDisplay(rows[1], sheetGroups(rows), rows, new Set([ref]))
  assert.deepEqual(display.positions, [0, 1, 5, 6])
  assert.equal(display.entries.length, 7)
  assert.equal(display.entries[2].column.cell(0).value, '7')
  assert.equal(display.entries[2].preview, true)
  assert.equal(display.entries[1].column.cssMode, GROUP_START)
  assert.equal(display.entries[4].column.cssMode, GROUP_END)
  assert.equal(rows[1].length, 4)
  assert.deepEqual(staffDisplay(rows[1], sheetGroups(rows), rows, new Set()).positions, [0, 1, 2, 3])
  assert.equal(staffDisplay(rows[1], [], rows, new Set([ref])).entries.length, 4)
})
