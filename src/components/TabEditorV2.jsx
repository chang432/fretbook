import { normalizeCell } from '../utils/tab.js'

/**
 * The second editor, stripped to the bone: one staff per row, a cell per
 * position, and nothing else. Type a fret into a cell and it is written and
 * shown — that is the whole of what this does.
 *
 * Everything else TabEditor carries is deliberately absent: no groups,
 * arrangement or memo, no edit mode, no ties or symbols, no shifting, no
 * range copy, no folding, no naming, no audio, no keyboard navigation past
 * what a browser gives an input. This is the floor the next version is built
 * up from, so features arrive here one at a time rather than being inherited
 * in a block.
 *
 * **There are no bars.** A row is a plain run of positions with nothing
 * dividing it, so nothing here counts in fours or has to be converted out of
 * a bar count before it can be drawn.
 *
 * `rows` is the whole sheet: one entry per row, each the run of columns that
 * row is written on, each column the six strings of one position. A row owns
 * its own notes, so a position is named by the row it is in and where it
 * stands in that row — there is no sheet-wide column number, and rows differ
 * in length without anything having to be worked out from the rows above.
 * Driven by TabEditorV2Lab at /v2; nothing in App reaches it.
 */
export default function TabEditorV2({ rows, tuning, onCellChange }) {
  return (
    <div className="editor">
      {rows.map((columns, staff) => (
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
                  // The string is drawn a cell at a time rather than as one
                  // line across the row, so that a position can be left out
                  // of it — see `.string-row--segmented` in styles.css. Add
                  // `cell--unstrung` to a cell and the line skips it.
                  <div className="string-row string-row--segmented" key={stringIndex}>
                    {columns.map((column, col) => {
                      const value = column[stringIndex]

                      return (
                        <input
                          key={col}
                          className={`cell${value ? ' cell--filled' : ''}`}
                          value={value}
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck="false"
                          // Positions start again at 1 on every row, so the
                          // row is named here too: "position 1" alone would
                          // point at one cell per row rather than at one cell.
                          aria-label={`Row ${staff + 1}, string ${tuning[stringIndex]}, position ${col + 1}`}
                          // Frets are checked on the way in, so a cell can
                          // only ever hold something playable.
                          onChange={(event) =>
                            onCellChange(staff, col, stringIndex, normalizeCell(event.target.value))
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
      ))}
    </div>
  )
}
