import { useState } from 'react'
import TabEditorV2 from './TabEditorV2.jsx'
import { STANDARD_TUNING, createGrid, totalColumns } from '../utils/tab.js'

/** Two rows — four bars then two — with a few frets already written in. */
const MOCK_ROWS = [4, 2]

/** Mock notes as [column, string, fret]; string 0 is the top line. */
const MOCK_NOTES = [
  [0, 5, '0'],
  [2, 5, '3'],
  [4, 5, '5'],
  [6, 4, '2'],
  [8, 3, '0'],
  [10, 2, '12'],
  [16, 2, '7'],
  [17, 2, '7'],
  [18, 1, '8'],
  [20, 0, '5'],
]

/** The mock grid, built fresh each time so Reset really does start over. */
function mockGrid() {
  const grid = createGrid(totalColumns(MOCK_ROWS))
  MOCK_NOTES.forEach(([col, string, value]) => {
    grid[col][string] = value
  })
  return grid
}

/**
 * A bench for TabEditorV2: mock data in, the four props it takes wired up,
 * nothing else.
 *
 * It stands in for App while the second editor is built up, and does only
 * what that editor needs — hold a grid and write one cell of it. No undo, no
 * autosave, no publishing, no audio, and nothing is persisted: a reload is a
 * fresh mock sheet. As TabEditorV2 grows a feature, its state belongs here.
 *
 * Reached at /v2. Its own chrome is styled inline rather than in styles.css,
 * which keeps test-only rules out of the sheet's stylesheet; the staves under
 * it draw in the app's real styles, since those are loaded globally.
 */
export default function TabEditorV2Lab() {
  const [grid, setGrid] = useState(mockGrid)

  /** Write one cell, leaving the rest of the grid as it stands. */
  const writeCell = (col, stringIndex, value) =>
    setGrid((prev) => {
      if (col < 0 || col >= prev.length || prev[col][stringIndex] === value) return prev
      return prev.map((column, i) =>
        i === col ? column.map((cell, s) => (s === stringIndex ? value : cell)) : column,
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
        <button type="button" onClick={() => setGrid(mockGrid())}>
          Reset mock notes
        </button>
      </header>

      <main className="sheet">
        <TabEditorV2
          grid={grid}
          rows={MOCK_ROWS}
          tuning={STANDARD_TUNING}
          onCellChange={writeCell}
        />
      </main>
    </div>
  )
}
