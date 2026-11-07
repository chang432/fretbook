import { useState } from 'react'
import Cell from './Cell.jsx'
import GroupLabel from './GroupLabel.jsx'

/**
 * The second editor, stripped to the bone: one staff per row, a cell per
 * position, and nothing else. Type a fret into a cell and it is written and
 * shown — that is the whole of what this does. What a cell itself is, is
 * Cell's business; this lays them out and says where each one stands.
 *
 * Everything else TabEditor carries is deliberately absent: no arrangement
 * or memo, no edit mode, no ties or symbols, no shifting, no range copy, no
 * folding, no audio, no keyboard navigation past what a browser gives an
 * input. This is the floor the next version is built up from, so features
 * arrive here one at a time rather than being inherited in a block.
 *
 * **There are no bars.** A row is a plain run of positions with nothing
 * dividing it, so nothing here counts in fours or has to be converted out of
 * a bar count before it can be drawn.
 *
 * Groups are marked inside a row rather than around a run of them: pressing
 * either end of one opens it, which stands its cells back and brings up the
 * name in the middle of it. Which group is open is the only thing this
 * holds on to — it is about the page rather than about the song, so it is
 * not something the sheet should be told.
 *
 * `rows` is the whole sheet: a Row per staff, each holding its own run of
 * Columns, each of those holding one Cell per string — see utils/tabV2.js.
 * A row owns its own notes, so a position is named by the row it is in and
 * where it stands in that row; there is no sheet-wide column number, and
 * rows differ in length without anything having to be worked out from the
 * rows above. Driven by TabEditorV2Lab at /v2; nothing in App reaches it.
 */
export default function TabEditorV2({ rows, tuning, onCellChange, onRepeatChange, onNameChange }) {
  // The group standing open, as the row it is in and the position it opens
  // at. Null when none is.
  const [open, setOpen] = useState(null)

  const isOpen = (staff, group) => open?.row === staff && open?.start === group.start

  /** Open the group, or put it away when it is the one already open. */
  const press = (staff, group) => () =>
    setOpen((standing) =>
      standing?.row === staff && standing?.start === group.start
        ? null
        : { row: staff, start: group.start },
    )

  return (
    // `editor--v2` is what the second editor's own styles hang off, so they
    // reach nothing the app itself draws — see styles/v2.css.
    <div className="editor editor--v2">
      {rows.map((row, staff) => {
        const groups = row.groups
        const opened = groups.find((group) => isOpen(staff, group)) ?? null

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
                    // Each cell draws its own piece of the string, so that a
                    // position can be left out of the line — see Cell.
                    <div className="string-row string-row--segmented" key={stringIndex}>
                      {row.columns.map((column) => {
                        const at = column.rowPosition
                        const group = groups.find(
                          ({ start, end }) => at >= start && at <= end,
                        )

                        return (
                          <Cell
                            key={at}
                            cell={column.cell(stringIndex)}
                            row={staff}
                            col={at}
                            string={tuning[stringIndex]}
                            mode={column.cssMode}
                            repeat={column.repeat}
                            inGroup={Boolean(group) && isOpen(staff, group)}
                            onChange={(value) => onCellChange(staff, at, stringIndex, value)}
                            onPress={group ? press(staff, group) : undefined}
                            onRepeat={(count) => onRepeatChange(staff, at, count)}
                          />
                        )
                      })}
                    </div>
                  ))}

                  {/* The open group's name, in the middle of it. Only one
                      stands at a time, and only while its group is open. */}
                  {opened && (
                    <GroupLabel
                      name={opened.name}
                      from={opened.start}
                      span={opened.end - opened.start + 1}
                      onChange={(name) => onNameChange(staff, opened.start, name)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
