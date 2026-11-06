import { normalizeCell, rowStarts, rowWidth } from '../utils/tab.js'

/**
 * The second editor, stripped to the bone: one staff per row, a cell per
 * position, and nothing else. Type a fret into a cell and it is written and
 * shown — that is the whole of what this does.
 *
 * Everything else TabEditor carries is deliberately absent: no groups,
 * arrangement or memo, no edit mode, no ties or symbols, no shifting, no bar
 * buttons, no range copy, no folding, no naming, no audio, no keyboard
 * navigation past what a browser gives an input. This is the floor the next
 * version is built up from, so features arrive here one at a time rather than
 * being inherited in a block.
 *
 * `rows` is the bar count of each row — rows can differ in length, so every
 * width is read from it — and `grid` is the flat run of columns they index
 * into, exactly as in TabEditor. Driven by TabEditorV2Lab at /v2; nothing in
 * App reaches it.
 */
export default function TabEditorV2({ grid, rows, tuning, onCellChange }) {
  // The column each row starts at.
  const starts = rowStarts(rows)

  return (
    <div className="editor">
      {rows.map((bars, staff) => {
        const start = starts[staff]
        const staffColumns = grid.slice(start, start + rowWidth(bars))

        return (
          <div className="staff" key={staff} role="group" aria-label={`Row ${staff + 1}`}>
            <div className="staff-labels">
              {tuning.map((label, stringIndex) => (
                <span className="string-label" key={stringIndex}>
                  {label}
                </span>
              ))}
            </div>

            <div className="staff-scroll">
              <div className="staff-run">
                <div className="staff-body">
                  {tuning.map((_, stringIndex) => (
                    <div className="string-row" key={stringIndex}>
                      {staffColumns.map((column, indexInStaff) => {
                        const col = start + indexInStaff
                        const value = column[stringIndex]

                        return (
                          <input
                            key={col}
                            className={`cell${value ? ' cell--filled' : ''}`}
                            value={value}
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck="false"
                            aria-label={`String ${tuning[stringIndex]}, position ${col + 1}`}
                            // Frets are checked on the way in, so a cell can
                            // only ever hold something playable.
                            onChange={(event) =>
                              onCellChange(col, stringIndex, normalizeCell(event.target.value))
                            }
                            onFocus={(event) => event.target.select()}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
