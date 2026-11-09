import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Cell from './Cell.jsx'
import CellMenu from './CellMenu.jsx'
import DeleteBar from './DeleteBar.jsx'
import { TrashIcon } from './icons.jsx'
import ActionBar from './ActionBar.jsx'
import StaffOverlay from './StaffOverlay.jsx'
import { markPath } from '../utils/layout.js'
import GroupCover from './GroupCover.jsx'
import { GROUP_REF, canPasteAt, previousWrittenPosition, sheetGroups } from '../utils/tabV2.js'
import { staffDisplay } from '../utils/staffDisplay.js'

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
/** How many positions a press on the row's own two buttons is worth. */
const ROW_STEP = 8

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
  return body?.querySelector(`.string-row--top > [data-column="${col}"]`) ?? element
}

export default function TabEditorV2({
  editingRows,
  onReorderRows,
  rows,
  tuning,
  onCellChange,
  onRepeatChange,
  onNameChange,
  onRowNameChange,
  onCopyPrevious,
  ties,
  marks,
  onToggleMark,
  onTie,
  onPlaceGroup,
  onStartGroup,
  onEndGroup,
  onCancelGroup,
  onInsertColumn,
  onDeleteColumn,
  onPasteRange,
  onResizeRow,
  onDeleteRow,
  canDeleteRow = false,
  onPlayNote,
  onDeleteGroup,
  onDeleteRef,
}) {
  // What is being worked on, and nothing else is: `kind` says which of the
  // three it is, `row` and `col` where it stands — the opening position,
  // for a group — and `element` what the buttons over it hang off. Null
  // when nothing is.
  const [working, setWorking] = useState(null)
  const focusAfterColumnChange = useRef(null)
  const [heldRow, setHeldRow] = useState(null)
  const [wasEditingRows, setWasEditingRows] = useState(editingRows)
  const [armed, setArmed] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [copyRange, setCopyRange] = useState(null)
  const [expandedRefs, setExpandedRefs] = useState(() => new Set())
  const [hoveredGroup, setHoveredGroup] = useState(null)
  const collapseRef = (reference) => {
    setExpandedRefs((prev) => { const next = new Set(prev); next.delete(reference); return next })
    setWorking(null)
  }
  if (wasEditingRows !== editingRows) {
    setWasEditingRows(editingRows)
    setHeldRow(null)
    setWorking(null)
    setArmed(false)
    setCopyRange(null)
  }

  const chooseRow = (row) => {
    if (heldRow === null) { setHeldRow(row); return }
    if (heldRow !== row) {
      const order = rows.map((_, index) => index)
      ;[order[heldRow], order[row]] = [order[row], order[heldRow]]
      onReorderRows(order)
    }
    setHeldRow(null)
  }
  const moveRow = (gap) => {
    const order = rows.map((_, index) => index)
    const [moved] = order.splice(heldRow, 1)
    order.splice(gap > heldRow ? gap - 1 : gap, 0, moved)
    onReorderRows(order)
    setHeldRow(null)
  }
  const rowGap = (gap) => editingRows && <div className="row-move-gap">
    {heldRow !== null && <button type="button" className="row-move-drop" aria-label={`Move row ${heldRow + 1} to position ${gap + 1}`} onClick={() => moveRow(gap)}><span /></button>}
  </div>

  useEffect(() => {
    if (!editingRows) return undefined
    const escape = (event) => { if (event.key === 'Escape') setHeldRow(null) }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [editingRows])

  useEffect(() => {
    if (!copyRange) return undefined
    const cancel = (event) => { if (event.key === 'Escape') setCopyRange(null) }
    document.addEventListener('keydown', cancel)
    return () => document.removeEventListener('keydown', cancel)
  }, [copyRange])

  useLayoutEffect(() => {
    const target = focusAfterColumnChange.current
    if (!target) return
    target.body.querySelectorAll('.string-row')[target.string]
      ?.querySelector(`[data-column="${target.col}"] > input.cell`)?.focus()
    focusAfterColumnChange.current = null
  }, [rows])

  const selected = working?.kind === 'cell' ? working : null

  // Keep the menu anchored while focus follows a changed column.
  const followColumn = (target) => {
    const { col, string, element } = working
    const body = element.closest('.staff-body')
    if (target < 0 || !body) {
      setWorking(null)
      return
    }
    const rect = columnTop(element, col).getBoundingClientRect()
    const menuAnchor = working.menuAnchor ?? { getBoundingClientRect: () => rect }
    focusAfterColumnChange.current = { body, col: target, string, menuAnchor }
    setWorking({ ...working, col: target, menuAnchor })
    setArmed(false)
  }


  const navigateCell = (event, row, col, string) => {
    if (armed || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    const [dx, dy] = direction
    const nextString = string + dy
    if (nextString < 0 || nextString >= tuning.length) return
    let nextCol = col + dx
    while (dx && rows[row].column(nextCol)?.isGroupMark) nextCol += dx
    if (!rows[row].column(nextCol) || rows[row].column(nextCol).isGroupMark) return
    const body = event.currentTarget.closest('.staff-body')
    const stringRow = body?.querySelectorAll('.string-row')[nextString]
    stringRow?.querySelector(`[data-column="${nextCol}"] > input.cell`)?.focus()
  }

  // A group opened and not yet closed: its opening column stands on the
  // sheet already, and every position that could close it is lit until one
  // of them is pressed. Pressing anywhere else takes the opening back —
  // see the effect below — because an opening with no end is not a group
  // and there would be no way to be rid of it.
  const opening = working?.kind === 'opening' ? working : null
  const closers = opening ? (rows[opening.row]?.closersFor(opening.col) ?? []) : []
  const targets = []
  if (selected && rows[selected.row]?.column(selected.col)?.cell(selected.string)?.value) {
    const columns = rows[selected.row].columns
    for (const step of [-1, 1]) {
      for (let at = selected.col + step; at >= 0 && at < columns.length; at += step) {
        if (columns[at].isGroupMark) break
        targets.push(at)
        if (!columns[at].cell(selected.string).isEmpty) break
      }
    }
  }

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

  const referencedGroup = working?.kind === 'ref'
    ? groups.find((group) => group.name === rows[working.row]?.column(working.col)?.name)
    : null

  const isOpen = (staff, group) =>
    (working?.kind === 'group' && working.row === staff && working.col === group.start) ||
    (referencedGroup?.row === staff && referencedGroup.start === group.start)

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
      ref: '.cell-slot--group-ref, .group-cover, .cell-slot--in-group',
      opening: '.cell-slot--closing',
    }[working.kind]

    const away = (event) => {
      if (event.target.closest?.('.action-bar, .popover')) return
      if (armed && event.target.closest?.('.cell--tie-target')) return
      if (own && event.target.closest?.(own)) return
      if (working.kind === 'cell' && working.element?.contains(event.target)) return
      // An opening nobody closed comes back out, so that the sheet is
      // never left holding half a group.
      if (working.kind === 'opening') onCancelGroup(working.row, working.col)
      setWorking(null)
    }

    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [working, armed, onCancelGroup])

  const holdButton = selected && targets.length > 0 && (
    <button type="button" className={`action-bar-button${armed ? ' is-open' : ''}`} aria-label="Hold this note through to another position" aria-pressed={armed} onMouseDown={(event) => event.preventDefault()} onClick={() => { setArmed(!armed); setCursor(targets.find((at) => at > selected.col) ?? targets[0]) }}>
      <svg width="20" height="14" aria-hidden="true"><path d="M 2 11 Q 10 1 18 11" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    </button>
  )
  const hasNote = selected && !rows[selected.row].column(selected.col).cell(selected.string).isEmpty
  const marked = hasNote && marks.some((mark) => mark.row === selected.row && mark.col === selected.col && mark.string === selected.string)
  const cellButtons = hasNote && <>
    {holdButton}
    <button type="button" className={`action-bar-button${marked ? ' is-open' : ''}`} aria-label="Toggle zigzag" title="Toggle zigzag" aria-pressed={Boolean(marked)} onMouseDown={(event) => event.preventDefault()} onClick={() => onToggleMark(selected.row, selected.col, selected.string)}>
      <svg width="26" height="14" aria-hidden="true"><path d={markPath(13, 7)} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    </button>
  </>

  return (
    // `editor--v2` is what the second editor's own styles hang off, so they
    // reach nothing the app itself draws — see styles/v2.css.
    <div className="editor editor--v2">
      {rows.map((row, staff) => {
        const groups = row.groups
        const opened = groups.find((group) => isOpen(staff, group)) ?? null
        const hovered = !editingRows && !opening && !copyRange && hoveredGroup?.row === staff
          ? groups.find((group) => group.start === hoveredGroup.start && !isOpen(staff, group))
          : null
        const display = staffDisplay(row, sheetGroups(rows), rows, expandedRefs)
        const mapTie = (tie) => ({ ...tie, from: display.positions[tie.from], to: display.positions[tie.to] })
        const shownTies = ties.filter((tie) => tie.row === staff).map(mapTie)
        const shownMarks = marks.filter((mark) => mark.row === staff).map((mark) => ({ ...mark, col: display.positions[mark.col] }))
        display.previews.forEach(({ source, start }) => {
          ties.filter((tie) => tie.row === source.row && tie.from > source.start && tie.to < source.end).forEach((tie) => shownTies.push({ ...tie, from: start + tie.from - source.start, to: start + tie.to - source.start }))
          marks.filter((mark) => mark.row === source.row && mark.col > source.start && mark.col < source.end).forEach((mark) => shownMarks.push({ ...mark, col: start + mark.col - source.start }))
        })

        return (
          <Fragment key={staff}>
          {rowGap(staff)}
          <div className="staff" role="group" aria-label={`Row ${staff + 1}`}>
            {editingRows && <button type="button" className={`row-move-select${heldRow === staff ? ' is-selected' : ''}`} aria-label={heldRow === null ? `Pick up row ${staff + 1}` : heldRow === staff ? `Put down row ${staff + 1}` : `Swap row ${heldRow + 1} with row ${staff + 1}`} aria-pressed={heldRow === staff} onClick={() => chooseRow(staff)} />}
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
            <input className="staff-group-name" aria-label={`Staff ${staff + 1} label`} value={row.name} autoCapitalize="off" onFocus={(event) => event.target.select()} onChange={(event) => onRowNameChange(staff, event.target.value)} />

            <div className="staff-scroll">
              <div className="staff-run">
                <div className="staff-body">
                  {copyRange?.phase === 'select' && copyRange.row === staff && row.columns.map((column, at) => at >= copyRange.start && at <= copyRange.limit && (
                    <button key={`select-${at}`} type="button" className="range-copy-choice" style={{ left: `calc(${display.positions[at]} * var(--cell-w))` }} aria-label={`Copy through position ${at + 1}`} onClick={() => setCopyRange({ ...copyRange, phase: 'paste', end: at })} />
                  ))}
                  {copyRange?.phase === 'paste' && row.columns.map((column, at) => {
                    const count = copyRange.end - copyRange.start + 1
                    if (!canPasteAt(row, at, count)) return null
                    return <button key={`paste-${at}`} type="button" className="range-copy-choice range-copy-choice--paste" style={{ left: `calc(${display.positions[at]} * var(--cell-w))` }} aria-label={`Paste starting at position ${at + 1} in row ${staff + 1}`} title="Paste starting here" onClick={() => { onPasteRange(copyRange.row, copyRange.start, copyRange.end, staff, at); setCopyRange(null) }} />
                  })}
                  <StaffOverlay ties={shownTies} marks={shownMarks} staffStart={0} cols={display.entries.length} preview={armed && selected?.row === staff && cursor !== null ? mapTie({ string: selected.string, from: Math.min(selected.col, cursor), to: Math.max(selected.col, cursor) }) : null} />
                  {display.previews.map(({ source, start, span, reference }) => (
                    <Fragment key={`controls-${start}`}>
                      <button type="button" className="ref-expanded-hit" style={{ left: `calc(${start} * var(--cell-w))`, width: `calc(${span} * var(--cell-w))` }} aria-label={`Collapse group ${source.name} notes`} onMouseDown={(event) => event.preventDefault()} onClick={() => collapseRef(reference)} />
                      <div className="ref-expanded-controls" style={{ left: `calc((${start} + ${span} / 2) * var(--cell-w))` }}>
                        <span className="ref-expanded-name">{source.name}</span>
                        <button type="button" className="ref-expanded-collapse" aria-label={`Collapse group ${source.name} notes`} aria-expanded="true" onClick={() => collapseRef(reference)}>◀</button>
                      </div>
                      <span className="ref-expanded-repeat" style={{ left: `calc((${start} + ${span} - 1) * var(--cell-w))` }} aria-label={`Repeated ${reference.repeat ?? 1} times`}>x{reference.repeat ?? 1}</span>
                    </Fragment>
                  ))}
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
                      {display.entries.map(({ column, col: at, preview, refCol }, displayAt) => {
                        if (preview) return <span key={`preview-${displayAt}`} data-column={displayAt === display.positions[refCol] ? refCol : undefined} onMouseDown={press('ref', staff, refCol)} className={`cell-slot ref-preview${column.cssMode ? ` cell-slot--${column.cssMode}` : ''}`} aria-hidden="true"><span className={`cell ref-preview-cell${column.cell(stringIndex).isEmpty ? '' : ' cell--filled'}`}>{column.cell(stringIndex).value}</span></span>
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
                            expanded={expandedRefs.has(column)}
                            onToggleExpand={column.isGroupRef && sheetGroups(rows).some((group) => group.name === column.name) ? () => { setExpandedRefs((prev) => { const next = new Set(prev); if (next.has(column)) next.delete(column); else next.add(column); return next }); setWorking(null) } : undefined}
                            repeat={column.repeat}
                            inGroup={Boolean(group) && isOpen(staff, group)}
                            name={column.name}
                            onChange={(value) => {
                              onCellChange(staff, at, stringIndex, value)
                              if (value) onPlayNote?.(stringIndex, value)
                            }}
                            onSelect={(element) =>
                              { setArmed(false); setWorking({ kind: 'cell', row: staff, col: at, string: stringIndex, element, menuAnchor: focusAfterColumnChange.current?.menuAnchor }) }
                            }
                            onNavigate={(event) => navigateCell(event, staff, at, stringIndex)}
                            onPlay={() => onPlayNote?.(stringIndex, column.cell(stringIndex).value)}
                            onGroupHover={column.isGroupEdge && group ? () => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setHoveredGroup({ row: staff, start: group.start }) } : undefined}
                            onGroupLeave={column.isGroupEdge && group ? () => setHoveredGroup((current) => current?.row === staff && current.start === group.start ? null : current) : undefined}
                            closes={Boolean(opening) && opening.row === staff && closers.includes(at)}
                            closesNow={Boolean(opening) && opening.row === staff && cursor === at}
                            onCloseHover={() => setCursor(at)}
                            onClose={() => {
                              onEndGroup(staff, opening.col, at)
                              setWorking(null)
                              setCursor(null)
                            }}
                            tieTarget={armed && selected?.row === staff && selected.string === stringIndex && targets.includes(at)}
                            onTieHover={() => setCursor(at)}
                            onTieTarget={() => { onTie(staff, stringIndex, selected.col, at); setArmed(false); setCursor(null) }}
                            // A group played here is pressed as itself,
                            // even where it stands inside some other
                            // group's span.
                            onPress={
                              column.cssMode === GROUP_REF
                                ? press('ref', staff, at)
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
                      from={display.positions[opened.start]}
                      span={display.positions[opened.end] - display.positions[opened.start] + 1}
                      onChange={(name) => onNameChange(staff, opened.start, name)}
                      onAnchor={setCover}
                    />
                  )}
                  {hovered && (
                    <GroupCover name={hovered.name} from={display.positions[hovered.start]} span={display.positions[hovered.end] - display.positions[hovered.start] + 1} preview />
                  )}
                </div>

                {/* The row's own length, past the end of its strings. They
                    stand inside the scroller so they travel with the row
                    they act on, the way the first editor's do, and so that
                    the scroll which reaches the last position reaches them.

                    Taking away stops at the last column that belongs to a
                    group, since a row cut short through one would leave the
                    group with one end — so the button stands down when
                    there is nothing left it may take. */}
                <div className="row-bars">
                  <button
                    type="button"
                    className="bar-button"
                    title={`Add ${ROW_STEP} positions to this row`}
                    aria-label={`Add ${ROW_STEP} positions to row ${staff + 1}`}
                    onClick={() => onResizeRow(staff, ROW_STEP)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="bar-button"
                    disabled={row.spare === 0}
                    title={
                      row.spare === 0
                        ? 'Nothing here can come off the end of this row'
                        : `Take ${Math.min(ROW_STEP, row.spare)} positions off the end of this row`
                    }
                    aria-label={`Take ${ROW_STEP} positions off the end of row ${staff + 1}`}
                    onClick={() => onResizeRow(staff, -ROW_STEP)}
                  >
                    −
                  </button>
                  {/* And the row itself. The sheet keeps one row, so the
                      last one standing cannot be taken off it. */}
                  <button
                    type="button"
                    className="bar-button bar-button--delete"
                    disabled={!canDeleteRow}
                    title={
                      canDeleteRow
                        ? 'Delete this row — Undo takes it back'
                        : 'The sheet keeps at least one row'
                    }
                    aria-label={`Delete row ${staff + 1}`}
                    onClick={() => onDeleteRow(staff)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          </div>
          </Fragment>
        )
      })}
      {rowGap(rows.length)}

      {/* The buttons over whatever is being worked on. All three hang off
          the thing itself rather than standing in the staff, so a row
          scrolling inside itself cannot clip them. */}
      {working?.kind === 'cell' && (
        <CellMenu
          anchor={working.menuAnchor ?? columnTop(working.element, working.col)}
          groups={groups}
          canCopy={Boolean(previousWrittenPosition(rows, working.row, working.col))}
          // Not into the middle of a group: that position is the group's
          // own music, and the model refuses it — so it is not offered.
          canPlace={!rows[working.row]?.groupAt(working.col)}
          // Opening a group puts its first column down at once and leaves
          // the rest of the row waiting to be told where it ends.
          onOpenGroup={() => {
            const start = onStartGroup(working.row, working.col)
            if (start === null) return
            setWorking({ kind: 'opening', row: working.row, col: start })
            setCursor(null)
          }}
          // Only the first position needs a way to insert on its left.
          canInsertBefore={working.col === 0}
          onInsertBefore={() => {
            onInsertColumn(working.row, working.col)
            setWorking(null)
          }}
          onInsertAfter={() => {
            if (onInsertColumn(working.row, working.col + 1)) followColumn(working.col + 1)
          }}
          canDelete={rows[working.row]?.length > 1}
          onCopyRange={() => {
            const columns = rows[working.row].columns
            let limit = working.col
            while (limit + 1 < columns.length && !columns[limit + 1].isGroupMark) limit += 1
            setCopyRange({ phase: 'select', row: working.row, start: working.col, limit })
            setWorking(null)
          }}
          onDeleteColumn={() => {
            const { row, col } = working
            const columns = rows[row].columns
            // Select the next writable position, or the previous one at the end.
            const next = columns.findIndex((column, at) => at > col && !column.isGroupMark)
            const previous = columns.findLastIndex((column, at) => at < col && !column.isGroupMark)
            const target = next === -1 ? previous : next - 1
            if (onDeleteColumn(row, col)) followColumn(target)
          }}
          onCopy={() => onCopyPrevious(working.row, working.col)}
          onPlace={(name) => {
            onPlaceGroup(working.row, working.col, name)
            // What was selected is not there any more: the column it stood
            // in is the group now, and everything past it has moved along.
            setWorking(null)
          }}
        >
          {selected?.string === 0 ? cellButtons : null}
        </CellMenu>
      )}

      {selected && selected.string !== 0 && cellButtons && (
        <ActionBar anchor={selected.element} label="This note">
          {cellButtons}
        </ActionBar>
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
