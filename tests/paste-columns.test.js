import test from 'node:test'
import assert from 'node:assert/strict'
import { GROUP_START, Row, canPasteAt, markColumn, pasteColumns, writeCell } from '../src/utils/tabV2.js'

test('pasting past the row end extends it and preserves copied values', () => {
  let sheet = [new Row(3), new Row(2)]
  sheet = writeCell(sheet, 0, 0, 0, '3')
  sheet = writeCell(sheet, 0, 2, 1, '5')
  assert.equal(canPasteAt(sheet[1], 1, 3), true)
  const result = pasteColumns(sheet, 0, 0, 2, 1, 1)
  assert.equal(result[1].length, 4)
  assert.equal(result[1].column(1).cell(0).value, '3')
  assert.equal(result[1].column(3).cell(1).value, '5')
  assert.equal(sheet[1].length, 2)
})

test('pasting cannot overwrite a group indicator', () => {
  let sheet = [new Row(3), new Row(3)]
  sheet = markColumn(sheet, 1, 2, GROUP_START, { name: 'A' })
  assert.equal(canPasteAt(sheet[1], 1, 3), false)
  assert.equal(pasteColumns(sheet, 0, 0, 2, 1, 1), sheet)
})
