import { useEffect, useState } from 'react'
import Cell from './Cell.jsx'
import CellMenu from './CellMenu.jsx'
import DeleteBar from './DeleteBar.jsx'
import GroupCover from './GroupCover.jsx'
import { GROUP_REF, GROUP_REF_END, sheetGroups } from '../utils/tabV2.js'

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
 * name in the middle of it, with the button for taking it off the sheet
 * above.
 *
 * One thing is being worked on at a time — a position, a group held open, or
 * a column where a group is played — which is the only thing this holds on
 * to. It is about the page rather than about the song, so it is not
 * something the sheet should be told. Holding the three as one is also what
 * keeps their buttons from standing over each other: starting on any of
 * them is leaving the last.
 *
 * `rows` is the whole sheet: a Row per staff, each holding its own run of
 * Columns, each of those holding one Cell per string — see utils/tabV2.js.
 * A row owns its own notes, so a position is named by the row it is in and
 * where it stands in that row; there is no sheet-wide column number, and
 * rows differ in length without anything having to be worked out from the
 * rows above. Driven by TabEditorV2Lab at /v2; nothing in App reaches it.
 */
/**
 * The slot at the head of the column a press landed in, whichever of its
 * six cells took the press: the buttons for a column stand over the whole
 * of it, so they hang off the top of the staff rather than off the one cell
 * that happened to be pressed.
 *
 * Every string row draws every column, in order, so the top row's child at
 * `col` is the head of that column. Read off the page rather than held in a
 * ref, since it is wanted only at the moment of the press.
 */
function columnTop(element, col) {
  const body = element.closest('.staff-body')
  return body?.querySelector('.string-row--top')?.children[col] ?? element
}

export default function TabEditorV2({
  rows,
  tuning,
  onCellChange,
  onRepeatChange,
  onNameChange,
  onRowNameChange,
  onPlaceGroup,
  onDeleteGroup,
  onDeleteRef,
}) {
  // What is being worked on, and nothing else is: `kind` says which of the
  // three it is, `row` and `col` where it stands — the opening position,
  // for a group — and `element` what the buttons over it hang off. Null
  // when nothing is.
  const [working, setWorking] = useState(null)

  // The cover over the open group, once it is on the page: the buttons for
  // that group stand over the cover rather than over any one of its cells,
  // and a cover cannot be measured before it exists.
  const [cover, setCover] = useState(null)

  // Every group written on the sheet, which is what there is to choose
  // from. Read once per draw rather than per cell: the list is the same
  // wherever it is opened.
  const groups = sheetGroups(rows)

  // The group being worked on, if it is a group, and how many places on the
  // sheet it is played. Deleting a group takes those with it, so the button
  // that does it says so first — counted here, where the whole sheet is in
  // hand, rather than inside the button.
  const openGroup =
    working?.kind === 'group'
      ? (groups.find(({ row, start }) => row === working.row && start === working.col) ??
        null)
      : null

  const played = !openGroup
    ? 0
    : rows.reduce(
        (count, row) =>
          count +
          row.columns.filter((column) => column.isGroupRef && column.name === openGroup.name)
            .length,
        0,
      )

  const isOpen = (staff, group) =>
    working?.kind === 'group' && working.row === staff && working.col === group.start

  /**
   * Start on something, or stop when it is the thing already being worked
   * on — so a second press on a group closes it again, and a second press
   * on a column where one is played puts its button away.
   */
  const press = (kind, staff, col) => (event) => {
    // The press is on the group rather than in the cell, so the cell must
    // not take the focus — or the caret — that a press on an input would
    // otherwise give it.
    event.preventDefault()
    const element = kind === 'ref' ? columnTop(event.currentTarget, col) : null
    setWorking((standing) =>
      standing?.kind === kind && standing.row === staff && standing.col === col
        ? null
        : { kind, row: staff, col, element },
    )
  }

  /**
   * A press anywhere else stops work on whatever was being worked on. Taken
   * on the way down rather than on the way up, so that it has already
   * happened by the time a press on some other group's end opens that one
   * instead.
   *
   * What counts as "anywhere else" depends on the three. The bars and the
   * list hanging off one are never somewhere else: they are how the thing
   * is worked on. Past that, a group is its cover, the name in it and its
   * own cells underneath — the cover lets presses through, so a press meant
   * for either end arrives at the cell; a played group is the column it
   * stands in; and a position is the cell itself, which has to be left
   * alone or pressing an already-selected cell would take its own buttons
   * away.
   */
  useEffect(() => {
    if (!working) return undefined

    const own = {
      cell: null,
      group: '.group-cover, .cell-slot--in-group',
      ref: '.cell-slot--group-ref, .cell-slot--group-ref-end',
    }[working.kind]

    const away = (event) => {
      if (event.target.closest?.('.action-bar, .popover')) return
      if (own && event.target.closest?.(own)) return
      if (working.kind === 'cell' && working.element?.contains(event.target)) return
      setWorking(null)
    }

    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [working])

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

            {/* What the row is called, written down its side between the
                string letters and the staff — see styles/v2.css. The box
                keeps its width whether or not there is a name in it, so
                every staff on the sheet starts at the same place. */}
            <input className="staff-group-name" aria-label={`Staff ${staff + 1} label`} value={row.name} onFocus={(event) => event.target.select()} onChange={(event) => onRowNameChange(staff, event.target.value)} />

            <div className="staff-scroll">
              <div className="staff-run">
                <div className="staff-body">
                  {tuning.map((_, stringIndex) => (
                    // Each cell draws its own piece of the string, so that a
                    // position can be left out of the line — see Cell.
                    //
                    // The outer two rows say so themselves rather than being
                    // picked out as the first and last of their parent:
                    // anything else drawn inside the staff — the cover over
                    // an open group, say — would otherwise take the name of
                    // last child away from the bottom string, and with it
                    // the foot of every bracket on the row.
                    <div
                      className={[
                        'string-row',
                        'string-row--segmented',
                        stringIndex === 0 ? 'string-row--top' : '',
                        stringIndex === tuning.length - 1 ? 'string-row--bottom' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={stringIndex}
                    >
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
                            name={column.name}
                            onChange={(value) => onCellChange(staff, at, stringIndex, value)}
                            onSelect={(element) =>
                              setWorking({ kind: 'cell', row: staff, col: at, element })
                            }
                            // A group played here is pressed as itself,
                            // even where it stands inside some other
                            // group's span. Either of its two columns is
                            // the same press: both name the opening one,
                            // which is where it is known by.
                            onPress={
                              column.cssMode === GROUP_REF
                                ? press('ref', staff, at)
                                : column.cssMode === GROUP_REF_END
                                  ? press('ref', staff, at - 1)
                                  : group
                                    ? press('group', staff, group.start)
                                    : undefined
                            }
                            onRepeat={(count) => onRepeatChange(staff, at, count)}
                          />
                        )
                      })}
                    </div>
                  ))}

                  {/* The sheet over the open group, with its name in the
                      middle. Only one stands at a time. */}
                  {opened && (
                    <GroupCover
                      // Keyed by the group, so that opening another on the
                      // same row builds a new cover rather than moving this
                      // one — which is what hands the buttons above it the
                      // place they are to stand.
                      key={opened.start}
                      name={opened.name}
                      from={opened.start}
                      span={opened.end - opened.start + 1}
                      onChange={(name) => onNameChange(staff, opened.start, name)}
                      onAnchor={setCover}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* The buttons over whatever is being worked on. All three hang off
          the thing itself rather than standing in the staff, so a row
          scrolling inside itself cannot clip them. */}
      {working?.kind === 'cell' && (
        <CellMenu
          anchor={columnTop(working.element, working.col)}
          groups={groups}
          onPlace={(name) => {
            onPlaceGroup(working.row, working.col, name)
            // What was selected is not there any more: the column it stood
            // in is the group now, and everything past it has moved along.
            setWorking(null)
          }}
        />
      )}

      {/* Taking the open group off the sheet, which takes every place it is
          played with it — so the button says as much before it is pressed. */}
      {working?.kind === 'group' && openGroup && (
        <DeleteBar
          anchor={cover}
          label={`Group ${openGroup.name}`}
          title={
            played === 0
              ? `Delete group ${openGroup.name}`
              : played === 1
                ? `Delete group ${openGroup.name} and the one place it is played`
                : `Delete group ${openGroup.name} and the ${played} places it is played`
          }
          onDelete={() => {
            onDeleteGroup(working.row, working.col)
            setWorking(null)
          }}
        />
      )}

      {/* And taking one place a group is played off the sheet, which leaves
          the group itself alone. */}
      {working?.kind === 'ref' && (
        <DeleteBar
          anchor={working.element}
          label="A group played here"
          title="Delete this group from here"
          onDelete={() => {
            onDeleteRef(working.row, working.col)
            setWorking(null)
          }}
        />
      )}
    </div>
  )
}
