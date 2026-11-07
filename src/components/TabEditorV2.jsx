import Cell from './Cell.jsx'

/**
 * The second editor, stripped to the bone: one staff per row, a cell per
 * position, and nothing else. Type a fret into a cell and it is written and
 * shown — that is the whole of what this does. What a cell itself is, is
 * Cell's business; this lays them out and says where each one stands.
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
 * `rows` is the whole sheet: a Row per staff, each holding its own run of
 * Columns, each of those holding one Cell per string — see utils/tabV2.js.
 * A row owns its own notes, so a position is named by the row it is in and
 * where it stands in that row; there is no sheet-wide column number, and
 * rows differ in length without anything having to be worked out from the
 * rows above. Driven by TabEditorV2Lab at /v2; nothing in App reaches it.
 */
export default function TabEditorV2({ rows, tuning, onCellChange }) {
  return (
    <div className="editor">
      {rows.map((row, staff) => (
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
                  // Each cell draws its own piece of the string, so that a
                  // position can be left out of the line — see Cell.
                  <div className="string-row string-row--segmented" key={stringIndex}>
                    {row.columns.map((column) => (
                      <Cell
                        key={column.rowPosition}
                        cell={column.cell(stringIndex)}
                        row={staff}
                        col={column.rowPosition}
                        string={tuning[stringIndex]}
                        onChange={(value) =>
                          onCellChange(staff, column.rowPosition, stringIndex, value)
                        }
                      />
                    ))}
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
