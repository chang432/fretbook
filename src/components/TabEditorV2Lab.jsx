import { useState } from 'react'
import TabEditorV2 from './TabEditorV2.jsx'
import {
  GROUP_END,
  GROUP_REPEAT,
  GROUP_START,
  Row,
  STANDARD_TUNING,
  markColumn,
  placeGroup,
  writeCell,
} from '../utils/tabV2.js'

/**
 * The mock sheet as raw data: one object per row, in the order they stand on
 * the page. A row says what it is called — written down its side, and left
 * out when there is nothing to call it — how long it is — nothing divides a row, so a length
 * is just a length, with no bar count to multiply up — what is written in it
 * loose, and what is written inside a group.
 *
 * Notes are [position, string, fret] triples. Positions are counted from the
 * start of their own row and string 0 is the top line, both the way the
 * editor addresses them, and a group's notes are counted the same way rather
 * than from the group's own start.
 *
 * A group names the positions it opens and closes at, how many times it is
 * played, and what it is called — one capital letter, A if it says nothing. Those two positions are columns of the row like any other —
 * they take up their place in the run — given over to saying where the
 * group begins and ends, so a group's own notes stand between them rather
 * than on them. The count takes a third column, the one just past the end,
 * and nothing is written there either.
 */
const MOCK_SHEET = [
  {
    rowName: 'Intro riff',
    length: 16,
    notes: [
      [0, 5, '0'],
      [2, 5, '3'],
      [4, 5, '5'],
      [14, 2, '12'],
    ],
    groups: [
      {
        start: 6,
        end: 11,
        repeat: 3,
        name: 'B',
        notes: [
          [7, 4, '2'],
          [9, 3, '0'],
          [10, 2, '7'],
        ],
      },
    ],
  },
  {
    rowName: 'Chorus',
    length: 8,
    notes: [
      [0, 2, '7'],
      [1, 2, '7'],
      [2, 1, '8'],
      [4, 0, '5'],
    ],
    groups: [],
  },
]

/**
 * The mock sheet, built fresh each time so Reset really does start over.
 * Written through the model rather than around it: the notes above are what
 * someone would have typed, and `writeCell` is what typing them does.
 */
function mockRows() {
  let sheet = MOCK_SHEET.map(({ length, rowName = '' }) => new Row(length, null, rowName))

  MOCK_SHEET.forEach(({ notes, groups }, row) => {
    const write = ([col, string, value]) => {
      sheet = writeCell(sheet, row, col, string, value)
    }

    notes.forEach(write)
    groups.forEach(({ start, end, repeat, name, notes: held }) => {
      sheet = markColumn(sheet, row, start, GROUP_START, { name })
      sheet = markColumn(sheet, row, end, GROUP_END)
      // The count stands in the column past the closing one. A group that
      // ends on a row's last position has nowhere to put it, and the mark
      // comes to nothing rather than running off the end.
      sheet = markColumn(sheet, row, end + 1, GROUP_REPEAT, { repeat })
      held.forEach(write)
    })
  })

  return sheet
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

  /**
   * How many times a group is played, and what it is called. Both are
   * written on one of the group's own columns — the count on the one past
   * its end, the name on the one it opens at — so both are a re-mark of
   * that column rather than anything new.
   */
  const handleRepeatChange = (row, col, repeat) =>
    setRows((prev) => markColumn(prev, row, col, GROUP_REPEAT, { repeat }))

  const handleNameChange = (row, col, name) =>
    setRows((prev) => markColumn(prev, row, col, GROUP_START, { name }))

  /**
   * Play a group at a position. The column becomes that group and the row
   * grows by one, for the count that stands beside it — so this is the one
   * edit here that changes how long a row is.
   */
  const handlePlaceGroup = (row, col, name) =>
    setRows((prev) => placeGroup(prev, row, col, name))

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
        <TabEditorV2
          rows={rows}
          tuning={STANDARD_TUNING}
          onCellChange={handleCellChange}
          onRepeatChange={handleRepeatChange}
          onNameChange={handleNameChange}
          onPlaceGroup={handlePlaceGroup}
        />
      </main>
    </div>
  )
}
