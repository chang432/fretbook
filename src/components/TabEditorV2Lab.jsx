import { useState } from 'react'
import TabEditorV2 from './TabEditorV2.jsx'
import { STANDARD_TUNING, createRow, writeCell } from '../utils/tabV2.js'

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
    const columns = createRow(length)
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
   * Write one cell. What that means to the sheet is the model's business —
   * the bench only holds what the model hands back. An unchanged sheet comes
   * back as the same array, so React re-renders nothing.
   */
  const handleCellChange = (row, col, string, value) =>
    setRows((prev) => writeCell(prev, row, col, string, value))

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
        <TabEditorV2 rows={rows} tuning={STANDARD_TUNING} onCellChange={handleCellChange} />
      </main>
    </div>
  )
}
