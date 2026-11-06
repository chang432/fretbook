import { useState } from 'react'
import TabEditorV2 from './TabEditorV2.jsx'
import { STANDARD_TUNING, createGrid } from '../utils/tab.js'

/**
 * How long each mock row is, in positions. Nothing divides a row, so a length
 * is just a length — there is no bar count to multiply up.
 */
const MOCK_LENGTHS = [16, 8]

/**
 * Mock notes, per row, as [position, string, fret]; string 0 is the top line.
 * Positions are counted from the start of their own row, the way the editor
 * addresses them.
 */
const MOCK_NOTES = [
  [
    [0, 5, '0'],
    [2, 5, '3'],
    [4, 5, '5'],
    [6, 4, '2'],
    [8, 3, '0'],
    [10, 2, '12'],
  ],
  [
    [0, 2, '7'],
    [1, 2, '7'],
    [2, 1, '8'],
    [4, 0, '5'],
  ],
]

/** The mock sheet, built fresh each time so Reset really does start over. */
function mockRows() {
  return MOCK_LENGTHS.map((length, row) => {
    const columns = createGrid(length)
    MOCK_NOTES[row].forEach(([col, string, value]) => {
      columns[col][string] = value
    })
    return columns
  })
}

/**
 * A bench for TabEditorV2: mock data in, the three props it takes wired up,
 * nothing else.
 *
 * It stands in for App while the second editor is built up, and does only
 * what that editor needs — hold the rows and write one cell of one of them.
 * No undo, no autosave, no publishing, no audio, and nothing is persisted: a
 * reload is a fresh mock sheet. As TabEditorV2 grows a feature, its state
 * belongs here.
 *
 * Reached at /v2. Its own chrome is styled inline rather than in styles.css,
 * which keeps test-only rules out of the sheet's stylesheet; the staves under
 * it draw in the app's real styles, since those are loaded globally.
 */
export default function TabEditorV2Lab() {
  const [rows, setRows] = useState(mockRows)

  /**
   * Write one cell, leaving the rest of the sheet as it stands. The row is
   * named as well as the position, since a row holds its own notes and a
   * position means nothing without the row it stands in.
   */
  const writeCell = (row, col, stringIndex, value) =>
    setRows((prev) => {
      const columns = prev[row]
      if (!columns || col < 0 || col >= columns.length) return prev
      if (columns[col][stringIndex] === value) return prev

      return prev.map((current, r) =>
        r === row
          ? current.map((column, c) =>
              c === col ? column.map((cell, s) => (s === stringIndex ? value : cell)) : column,
            )
          : current,
      )
    })

  return (
    <div className="app">
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h1 style={{ margin: 0, font: '600 20px Georgia, "Times New Roman", serif' }}>
          TabEditorV2 — bench
        </h1>
        <button type="button" onClick={() => setRows(mockRows())}>
          Reset mock notes
        </button>
      </header>

      <main className="sheet">
        <TabEditorV2 rows={rows} tuning={STANDARD_TUNING} onCellChange={writeCell} />
      </main>
    </div>
  )
}
