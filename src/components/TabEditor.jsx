import { useCallback, useRef, useState } from 'react'
import ArrangementSection from './ArrangementSection.jsx'
import GroupBar from './GroupBar.jsx'
import MarkBar from './MarkBar.jsx'
import MemoSection from './MemoSection.jsx'
import PositionStrip from './PositionStrip.jsx'
import StaffOverlay from './StaffOverlay.jsx'
import { PasteIcon, TrashIcon } from './icons.jsx'
import { cellMidi, noteName, nudgeTarget } from '../utils/audio.js'
import { groupTone } from '../utils/layout.js'
import {
  MARK_ZIGZAG,
  MAX_ROW_NAME,
  STRING_COUNT,
  emptyGroups,
  filledGroups,
  groupLabel,
  groupOfRow,
  groupRuns,
  isSameTie,
  makeRange,
  makeTie,
  markAt,
  normalizeCell,
  previousWrittenColumn,
  rangeLength,
  rowName,
  rowNoteCount,
  rowStarts,
  rowWidth,
} from '../utils/tab.js'

/** Typing this on a note applies the same symbol the button does. */
const MARK_KEYS = { w: MARK_ZIGZAG }

/** Keyboard equivalent of the tie button in the bar. */
const TIE_KEY = 't'

/** Keyboard equivalent of the rewind button beside it. */
const COPY_KEY = 'r'

/**
 * The whole writable sheet: one staff per row, top to bottom. `rows` is the
 * bar count of each — rows can differ in length, so every width here is read
 * from that rather than assumed — and `grid` is the flat run of columns they
 * index into.
 */
export default function TabEditor({
  grid,
  rows,
  rowIds,
  names,
  groups,
  members,
  memo,
  onMemoChange,
  arrangement,
  onAddToArrangement,
  onRemoveFromArrangement,
  editing,
  onSwapRows,
  onRenameRow,
  onAddRow,
  onAddGroup,
  onRenameGroup,
  onSetRowGroup,
  onMoveRow,
  onDeleteGroup,
  tuning,
  ties,
  marks,
  onCellChange,
  onCreateTie,
  onToggleMark,
  onPlayNote,
  onAddBar,
  onRemoveBar,
  onShiftRow,
  onCopyColumn,
  onNudgeNote,
  onStatus,
  onPasteRange,
  pendingRemove,
  onCancelRemove,
  onDeleteRow,
}) {
  // Inputs are addressed by "col:string" so keyboard navigation can jump to any
  // cell regardless of which staff chunk rendered it.
  const cellRefs = useRef(new Map())
  const [focused, setFocused] = useState(null)
  // Set once the tie button is pressed: the next press on an offered position
  // draws the arc. Cleared as soon as the selected note changes.
  const [arming, setArming] = useState(false)
  // The offered position currently aimed at, so hovering and the arrow keys
  // drive the same preview. Null until a target is picked.
  const [cursor, setCursor] = useState(null)
  // The rows showing their shift arrows, each against the position its shift
  // is anchored on, or null while it takes the whole row. A row stays open
  // until its own close button is pressed — writing in another row, or opening
  // a second row's arrows, leaves it exactly as it was.
  const [shiftRows, setShiftRows] = useState(() => new Map())
  // The row edit mode has picked up and is waiting to swap, by its place on
  // the page. Null between swaps, and whenever the mode is not on.
  const [selectedRow, setSelectedRow] = useState(null)
  // The range copy's stretch of positions. `to` is null between the first press
  // and the second, which is the state the strip draws as one circle filled and
  // nothing carried yet. Null when nothing is picked out.
  const [range, setRange] = useState(null)
  // The paste button waiting on a second press because the first would have
  // written over notes, as an absolute column. Null when nothing is armed.
  const [pendingPaste, setPendingPaste] = useState(null)
  // The groups folded away to their bar, by group id. A fold is a way of
  // handling the page rather than anything about the song, so — like a folded
  // row — it is not saved with the sheet.
  const [foldedGroups, setFoldedGroups] = useState(() => new Set())
  // The row whose name is being typed, and what has been typed so far. Null
  // when no box is open; only ever one at a time.
  const [naming, setNaming] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  // Set by Escape, so the blur that follows it closes the box instead of
  // writing down what was abandoned in it.
  const abandoning = useRef(false)
  // The rows folded away to their name line, by row id rather than by
  // place, so a row stays folded wherever it is moved to. A fold is a way of
  // handling the page rather than anything about the song, so it is not saved
  // with the sheet.
  const [foldedRows, setFoldedRows] = useState(() => new Set())

  const valueAt = (col, stringIndex) => grid[col]?.[stringIndex] ?? ''

  /** The number in a row's circle — where the row stands on the page. */
  const label = (rowIndex) => rowIndex + 1

  /** The name this row has been given, or '' when it has none. */
  const nameOf = (rowIndex) => rowName(names, rowIds[rowIndex])

  /** True while this group is folded away to its bar. */
  const isGroupFolded = (groupId) => foldedGroups.has(groupId)

  /** Fold a group's rows away, or bring them back. */
  const toggleGroupFold = (groupId) => {
    setFoldedGroups((folded) => {
      const next = new Set(folded)
      if (!next.delete(groupId)) next.add(groupId)
      return next
    })
  }

  /** True while this row is folded away to its name line. */
  const isFolded = (rowIndex) => foldedRows.has(rowIds[rowIndex])

  /** The group this row is in, or null when it is in none. */
  const groupOf = (rowIndex) => groupOfRow(members, rowIds[rowIndex])

  /** How a row is spoken of: its number, and its name where it has one. */
  const rowTitle = (rowIndex) =>
    nameOf(rowIndex) ? `Row ${label(rowIndex)} — ${nameOf(rowIndex)}` : `Row ${label(rowIndex)}`

  /** Open the name box on a row, with whatever it is called already in it. */
  const startNaming = (rowIndex) => {
    setNaming(rowIndex)
    setNameDraft(nameOf(rowIndex))
  }

  /**
   * Close the box, writing down what was typed unless Escape sent us here.
   * Both ways out of the box — Enter and a press elsewhere — arrive as a blur,
   * so the name is written in one place rather than in each of them.
   */
  const finishNaming = (rowIndex) => {
    setNaming(null)
    if (abandoning.current) {
      abandoning.current = false
      return
    }
    onRenameRow(rowIndex, nameDraft)
  }

  // Edit mode lays a sheet over the whole row, so a box open underneath it
  // could neither be typed in nor closed. It is stood down with the rest of
  // the row's own controls for as long as the mode is on.
  const nameBox = editing ? null : naming

  /**
   * Fold a row away to its name line, or open one again. Folding takes the
   * strings off the page along with everything standing over them, so the
   * errands open on the row are closed as it goes rather than left waiting
   * where they cannot be seen or reached.
   *
   * Folding is left on in edit mode, unlike naming: a row folded away is
   * still a row to pick up and swap, and a sheet of folded rows is an easier
   * thing to put in order than a sheet of staves.
   */
  const toggleFold = (rowIndex) => {
    const id = rowIds[rowIndex]
    if (foldedRows.has(id)) {
      setFoldedRows((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }

    setFoldedRows((prev) => new Set(prev).add(id))
    closeShift(rowIndex)
    if (range?.row === rowIndex) setRange(null)
    setPendingPaste(null)
  }

  const disarm = useCallback(() => {
    setArming(false)
    setCursor(null)
  }, [])

  // The column each row starts at.
  const starts = rowStarts(rows)

  /** First and last column of the staff line `col` sits on. */
  const staffBounds = (col) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (col >= starts[i]) return [starts[i], starts[i] + rowWidth(rows[i]) - 1]
    }
    return [0, grid.length - 1]
  }

  /**
   * Where a tie may run from a note: outwards in both directions across every
   * free position and on to the next written note, which is where the run
   * stops — as does the end of the staff line, whichever comes first.
   */
  const tieTargets = (col, stringIndex) => {
    if (!valueAt(col, stringIndex)) return []
    const [rowStart, rowEnd] = staffBounds(col)
    const targets = []

    for (const step of [-1, 1]) {
      for (let at = col + step; at >= rowStart && at <= rowEnd; at += step) {
        targets.push(at)
        if (valueAt(at, stringIndex)) break
      }
    }
    return targets.sort((a, b) => a - b)
  }

  /** True when this pair is already joined, so pressing it takes the arc off. */
  const isTied = (col, stringIndex, target) =>
    ties.some((tie) => isSameTie(tie, makeTie(stringIndex, col, target)))

  const commitTie = (col, stringIndex, target) => {
    onCreateTie(stringIndex, col, target)
    disarm()
  }

  const setShiftRow = (row, anchor) => setShiftRows((prev) => new Map(prev).set(row, anchor))

  const openShift = (row) => setShiftRow(row, null)

  const closeShift = (row) =>
    setShiftRows((prev) => {
      const next = new Map(prev)
      next.delete(row)
      return next
    })

  const closeShiftOnEscape = (row) => (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    closeShift(row)
  }

  /** Anchor a row's shift on a position, or take the anchor off it again. */
  const toggleAnchor = (row, col) =>
    setShiftRow(row, shiftRows.get(row) === col ? null : col)

  /**
   * Shift a row, then leave the anchor on the position it has just moved to,
   * so pressing the same arrow again carries the same note further along. It
   * goes when the note it marked has been pushed off the end of the row.
   */
  const shift = (row, step) => {
    const anchor = shiftRows.get(row) ?? null
    onShiftRow(row, step, anchor)
    if (anchor === null) return

    const start = starts[row]
    const moved = anchor + step
    setShiftRow(row, moved >= start && moved < start + rowWidth(rows[row]) ? moved : null)
  }

  /* Range copy ----------------------------------------------------------- */

  /** True once both ends are down, which is when a range can be pasted. */
  const rangeReady = range !== null && range.to !== null

  /** True while this position is inside the stretch that has been picked out. */
  const inRange = (col) => rangeReady && col >= range.from && col <= range.to

  /** The end pressed first, which is drawn while a range is still half-made. */
  const isRangeEnd = (col) =>
    range !== null && (col === range.from || col === range.to)

  /**
   * The two presses a range is picked out with. The first sets one end, the
   * second sets the other, and a third starts again from where it was pressed
   * — so a stretch is re-aimed by pressing on rather than cleared first.
   *
   * A range never crosses a row break: pressing in a different row is taken as
   * the start of a new stretch there, not as an attempt to stretch this one
   * across two staff lines.
   */
  const chooseRangeEnd = (row, col) => {
    setPendingPaste(null)

    // A finished range, or one in another row, means this press starts over.
    if (!range || range.to !== null || range.row !== row) {
      setRange({ row, from: col, to: null })
      onStatus('Press a second position to mark the end of the stretch')
      return
    }

    // Pressing the open end again puts the stretch away rather than making a
    // one-position range nobody asked for.
    if (range.from === col) {
      setRange(null)
      onStatus('')
      return
    }

    const picked = makeRange(row, range.from, col)
    setRange(picked)
    onStatus(
      `${rangeLength(picked)} positions copied — press a paste button to write them down`,
    )
  }

  /**
   * Paste the stretch so it starts at this position. The first press on a
   * paste button that would write over notes only arms it and says what it
   * would cost; the second goes through. Anything that cannot happen at all
   * says why instead of doing nothing.
   */
  const paste = (col) => {
    if (!range || range.to === null) {
      onStatus('Pick out a stretch first — press two positions on one row')
      return
    }

    const outcome = onPasteRange(range, col, pendingPaste === col)
    if (outcome === 'confirm') setPendingPaste(col)
    else setPendingPaste(null)
  }

  /** Drop an armed paste when attention leaves the button holding it. */
  const cancelPaste = () => setPendingPaste(null)

  // A removed row leaves its number behind, which would otherwise greet the
  // next row added in its place with its arrows already out. Adjusted as the
  // row count changes rather than in an effect: it is not synchronising with
  // anything outside React, it is state that has gone stale.
  const [rowCount, setRowCount] = useState(rows.length)
  if (rowCount !== rows.length) {
    setRowCount(rows.length)
    setShiftRows((prev) => new Map([...prev].filter(([row]) => row < rows.length)))
    // A range pointing into a row that has gone would paste from nowhere.
    setRange((prev) => (prev && prev.row < rows.length ? prev : null))
    setPendingPaste(null)
    // A held row is held by position, so deleting any row leaves what is held
    // naming different tab. It is put back down rather than quietly re-aimed.
    setSelectedRow(null)
  }

  /**
   * The two presses edit mode runs on: the first picks a row up, the second
   * says which row to exchange it with, and pressing the same row again puts
   * it back down.
   */
  const chooseRow = (rowIndex) => {
    if (selectedRow === null) {
      setSelectedRow(rowIndex)
      return
    }
    if (selectedRow !== rowIndex) onSwapRows(selectedRow, rowIndex)
    setSelectedRow(null)
  }

  /**
   * The row edit mode is carrying, as the bars above need it: which row it
   * is called by, and whether this group is the one it is already in — which
   * is what decides whether pressing that bar takes the row in or lets it go.
   * Null whenever nothing is held, which is when a bar is not a target.
   */
  const held = (groupId) =>
    selectedRow === null
      ? null
      : { label: label(selectedRow), inGroup: groupOf(selectedRow) === groupId }

  /**
   * Send the held row to a group, or take it out of the one it is in. The row
   * moves to the end of that group's run, so it is somewhere else afterwards
   * and what was being held is no longer where it was: it is put back down
   * rather than quietly re-aimed, the same bargain a deleted row makes.
   */
  const dropHeldRow = (groupId, takes) => {
    if (selectedRow === null) return
    onSetRowGroup(selectedRow, takes ? groupId : null)
    setSelectedRow(null)
  }

  /**
   * Send the held row to a place between two rows — and into whichever group
   * that place belongs to, which is what the gap pressed knows and the row
   * being carried does not.
   *
   * Put back down afterwards, as a row sent to a bar is: it is somewhere else
   * now, and what was held is no longer where it was picked up from.
   */
  const moveHeldRow = (to, groupId) => {
    if (selectedRow === null) return
    onMoveRow(selectedRow, to, groupId)
    setSelectedRow(null)
  }

  /**
   * The place between two rows, as something to press while a row is held.
   * `to` is the gap it stands in — 0 above the first row of the sheet, one
   * more for each row after that — and `groupId` the group the gap is inside,
   * which is what makes the place under a group's bar a different offer from
   * the place just above it.
   *
   * The band is there for as long as the mode is, so picking a row up lights
   * the places it could go rather than moving the whole sheet about. The two
   * gaps either side of the held row are left unlit: they are where it is.
   */
  const gap = (to, groupId) => {
    const key = `gap-${to}-${groupId ?? 'loose'}`
    const standing =
      selectedRow !== null &&
      (to === selectedRow || to === selectedRow + 1) &&
      groupOf(selectedRow) === groupId

    if (selectedRow === null || standing) {
      return <div className="row-gap" key={key} aria-hidden="true" />
    }

    const where =
      groupId === null
        ? to === 0
          ? 'to the top of the sheet, in no group'
          : to === rows.length
            ? 'to the end of the sheet, in no group'
            : `between rows ${label(to - 1)} and ${label(to)}, in no group`
        : `into ${groupLabel(groups, groupId)}, ${
            to === 0 || groupOf(to - 1) !== groupId
              ? 'at its top'
              : `after row ${label(to - 1)}`
          }`

    return (
      <div className="row-gap" key={key}>
        <button
          type="button"
          className="row-gap-drop"
          onClick={() => moveHeldRow(to, groupId)}
          onKeyDown={dropOnEscape}
          title={`Move row ${label(selectedRow)} ${where}`}
          aria-label={`Move row ${label(selectedRow)} ${where}`}
        >
          <span className="row-gap-line" />
        </button>
      </div>
    )
  }

  /** The rows of one block, with the places between them to move a row to. */
  const rowsWithGaps = (indices, groupId) => {
    const out = []
    for (const staff of indices) {
      out.push(gap(staff, groupId), staffOf(staff))
    }
    out.push(gap(indices[indices.length - 1] + 1, groupId))
    return out
  }

  /** Put down whatever is held, the same as pressing it a second time. */
  const dropOnEscape = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setSelectedRow(null)
  }

  // Edit mode takes the sheet over, so everything aimed at a cell — the tie
  // being armed, the bar over the selected note, the row whose shift arrows
  // are out — is put away on the way in, and nothing is left held on the way
  // out. A shift's anchors and the mode's own circles are the same control
  // standing above the same staff for two different errands, which is why a
  // shift cannot survive the way in either. The stretch picked out and any
  // armed paste go the other way, on the way out: they belong to the mode.
  // Adjusted as the mode changes rather than in an effect, for the same
  // reason the row count is above: it is state that has gone stale.
  const [wasEditing, setWasEditing] = useState(editing)
  if (wasEditing !== editing) {
    setWasEditing(editing)
    setSelectedRow(null)
    setShiftRows(new Map())
    setFocused(null)
    setArming(false)
    setCursor(null)
    setRange(null)
    setPendingPaste(null)
  }

  const registerCell = useCallback((key) => (node) => {
    if (node) cellRefs.current.set(key, node)
    else cellRefs.current.delete(key)
  }, [])

  /**
   * Move to a cell and sound whatever is written there. This is the keyboard
   * half of the note preview — the mouse half hangs off the cells themselves —
   * so walking the staff with the arrows plays it back as you go.
   */
  const focusCell = (col, stringIndex) => {
    if (col < 0 || stringIndex < 0 || stringIndex >= STRING_COUNT) return
    const node = cellRefs.current.get(`${col}:${stringIndex}`)
    if (!node) return
    node.focus()
    node.select()
    onPlayNote(stringIndex, valueAt(col, stringIndex))
  }

  // The tie and the symbol only make sense over a note that is actually there;
  // the rewind is the one button that also has work to do on an empty
  // position, and it has that work whenever something stands before it.
  const focusedValue = focused ? valueAt(focused.col, focused.string) : ''
  // Arming with nowhere to go would offer a gesture with nothing to press.
  const targets = focusedValue ? tieTargets(focused.col, focused.string) : []
  const canCopy = !!focused && previousWrittenColumn(grid, focused.col) >= 0

  /** Arm the tie, aiming at the first free position after the note. */
  const arm = () => {
    if (arming || !targets.length) {
      disarm()
      return
    }
    setArming(true)
    setCursor(targets.find((at) => at > focused.col) ?? targets[targets.length - 1])
  }

  /**
   * Send the note under the cursor to another string without changing its
   * pitch, at the lowest fret there that sounds it — the correction for a note
   * written on the wrong string.
   */
  const nudge = (col, stringIndex, step) => {
    const column = grid[col] ?? []
    const target = nudgeTarget(column, stringIndex, step)

    if (!target) {
      // The outer strings have nowhere to go in one direction each, and a
      // neighbour may already be holding a note in this position. Saying so
      // beats a button that looks broken.
      if (cellMidi(column[stringIndex], stringIndex) !== null) {
        onStatus(`No free string ${step < 0 ? 'above' : 'below'} this one`)
      }
      return
    }

    onNudgeNote(col, stringIndex, target.string, target.fret)
    focusCell(col, target.string)
  }

  /** Which way the note under the cursor could go, for the buttons that do it. */
  const nudgeMoves = (col, stringIndex) =>
    [-1, 1]
      .map((step) => {
        const target = nudgeTarget(grid[col] ?? [], stringIndex, step)
        // The note is named as well as the fret: a nudge holds the note but
        // not always the octave, and that is worth seeing before it lands.
        return (
          target && {
            step,
            fret: target.fret,
            note: noteName(target.midi),
            label: tuning[target.string],
          }
        )
      })
      .filter(Boolean)

  const handleKeyDown = (event, col, stringIndex) => {
    const { key } = event

    // While a tie is armed the arrows aim it instead of moving between cells,
    // and enter draws it — the keyboard route to what the mouse does by
    // hovering and clicking.
    if (arming) {
      if (key === 'Escape') {
        event.preventDefault()
        disarm()
        return
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault()
        const next =
          key === 'ArrowRight'
            ? targets.find((at) => at > cursor)
            : targets.filter((at) => at < cursor).pop()
        if (next !== undefined) setCursor(next)
        return
      }
      if (key === 'Enter' || key === ' ') {
        event.preventDefault()
        if (cursor !== null) commitTie(col, stringIndex, cursor)
        return
      }
    }

    if ((key === 'ArrowUp' || key === 'ArrowDown') && event.shiftKey) {
      // Shift carries the note itself to the next string that can hold it,
      // rather than moving the cursor off it.
      event.preventDefault()
      nudge(col, stringIndex, key === 'ArrowUp' ? -1 : 1)
    } else if (key === 'ArrowUp') {
      event.preventDefault()
      focusCell(col, stringIndex - 1)
    } else if (key === 'ArrowDown') {
      event.preventDefault()
      focusCell(col, stringIndex + 1)
    } else if (key === 'ArrowLeft') {
      event.preventDefault()
      focusCell(col - 1, stringIndex)
    } else if (key === 'ArrowRight' || key === 'Enter' || key === ' ' || key === 'Tab') {
      // Space/Enter/Tab all mean "next chord" while writing a line out.
      event.preventDefault()
      focusCell(col + 1, stringIndex)
    } else if (key === 'Backspace' && event.currentTarget.value === '') {
      // Deleting past the start of an empty cell erases the previous one.
      event.preventDefault()
      onCellChange(col - 1, stringIndex, '')
      focusCell(col - 1, stringIndex)
    } else if (MARK_KEYS[key.toLowerCase()] && event.currentTarget.value) {
      // Keyboard equivalent of the symbol button, which cannot be tabbed to.
      event.preventDefault()
      onToggleMark(col, stringIndex, MARK_KEYS[key.toLowerCase()])
    } else if (key.toLowerCase() === TIE_KEY && event.currentTarget.value) {
      event.preventDefault()
      arm()
    } else if (key.toLowerCase() === COPY_KEY) {
      // No note needed under this one: filling an empty position is the point.
      event.preventDefault()
      onCopyColumn(col)
    }
  }

  const armedTargets = arming ? new Set(targets) : null
  const preview =
    arming && cursor !== null ? makeTie(focused.string, focused.col, cursor) : null

  /** True when this cell is one of the positions the armed tie may reach. */
  const isTieTarget = (col, stringIndex) =>
    !!armedTargets && stringIndex === focused.string && armedTargets.has(col)

  /** What pressing this target would do, for its tooltip. */
  const tieHint = (col, stringIndex) => {
    if (isTied(focused.col, stringIndex, col)) return 'Remove this tie'
    return valueAt(col, stringIndex)
      ? 'Join this note to the selected one'
      : 'Hold the selected note through to here'
  }

  /**
   * One row of the sheet, from its name line to the buttons past the end of
   * the staff. Handed out by the loop below rather than drawn in a run of its
   * own, since a row in a group is drawn inside that group's bracket.
   */
  const staffOf = (staff) => {
    const bars = rows[staff]
    const start = starts[staff]
    const cols = rowWidth(bars)
    const staffColumns = grid.slice(start, start + cols)

    // The strips stand inside the scroller and push the strings down, so the
    // string labels outside it have to come down by the same amount to stay
    // level. Counted rather than special-cased: edit mode shows its two, and
    // a row being shifted — which only happens outside the mode — shows one.
    const strips = (editing ? 2 : 0) + (shiftRows.has(staff) ? 1 : 0)

    // Only a folded row says what it holds, so only a folded row is counted.
    const folded = isFolded(staff)
    const notes = folded ? rowNoteCount(grid, rows, staff) : 0

    return (
      <div
        className={`staff${folded ? ' staff--folded' : ''}`}
        style={{ '--strips': strips }}
        key={staff}
        role="group"
        aria-label={rowTitle(staff)}
      >
        {/* What the row is called, and the one line of it that is left
            when it is folded away: the number, which folds and unfolds
            the row, then the name it has been given, which is pressed to
            write that name. A row with no name offers to take one only
            while it is hovered, so an unnamed sheet carries no clutter;
            naming stands down in edit mode, where the row itself is the
            thing being pressed. */}
        <div className="row-head">
          <button
            type="button"
            className={`row-number${folded ? ' is-folded' : ''}`}
            onClick={() => toggleFold(staff)}
            aria-expanded={!folded}
            title={folded ? 'Show this row' : 'Fold this row away'}
            aria-label={`Row ${label(staff)}`}
          >
            {label(staff)}
          </button>

          {nameBox === staff ? (
            <input
              className="row-name-input"
              value={nameDraft}
              autoFocus
              maxLength={MAX_ROW_NAME}
              placeholder="Name this row"
              aria-label={`Name of row ${label(staff)}`}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  // Nothing else on the page should act on the same press.
                  event.stopPropagation()
                  abandoning.current = true
                  event.currentTarget.blur()
                }
              }}
              onBlur={() => finishNaming(staff)}
            />
          ) : nameOf(staff) ? (
            <button
              type="button"
              className="row-name"
              disabled={editing}
              onClick={() => startNaming(staff)}
              title="Rename this row"
            >
              {nameOf(staff)}
            </button>
          ) : (
            !editing && (
              <button
                type="button"
                className="row-name row-name--empty"
                onClick={() => startNaming(staff)}
                title="Name this row"
              >
                Name
              </button>
            )
          )}

          {/* A row put away still says what is in it, so the sheet can be
              read down its folded rows. */}
          {folded && (
            <span className="row-folded">
              {bars} bar{bars === 1 ? '' : 's'}
              {notes > 0 && ` · ${notes} note${notes === 1 ? '' : 's'}`}
            </span>
          )}
        </div>

        {/* In edit mode a row is one thing to press rather than a grid of
            cells, so a transparent sheet is laid over the whole staff and
            takes the press. The tab underneath goes on being drawn — it is
            what you are choosing between. */}
        {editing && (
          <button
            type="button"
            className={`row-select${selectedRow === staff ? ' is-selected' : ''}`}
            aria-pressed={selectedRow === staff}
            onClick={() => chooseRow(staff)}
            onKeyDown={dropOnEscape}
            title={
              selectedRow === null
                ? 'Pick this row up, then press another to swap the two'
                : selectedRow === staff
                  ? 'Put this row back down'
                  : `Swap this row with row ${label(selectedRow)}`
            }
            aria-label={
              selectedRow === null || selectedRow === staff
                ? `Row ${label(staff)}`
                : `Swap row ${label(staff)} with row ${label(selectedRow)}`
            }
          />
        )}

        <div className="staff-labels">
          {tuning.map((label, stringIndex) => (
            <span className="string-label" key={stringIndex}>
              {label}
            </span>
          ))}
        </div>

        <div className="staff-scroll">
          {/* One circle per position, above the staff and scrolling with
              it, marking where a shift pivots. Only while the row's arrows
              are out: it is part of that errand, not of the staff. */}
          {!editing && shiftRows.has(staff) && (
            <PositionStrip
              className="anchor-strip"
              label={`Shift anchor for row ${label(staff)}`}
              start={start}
              cols={cols}
              cell={(col, indexInStaff) => {
                const anchor = shiftRows.get(staff) ?? null
                const selected = anchor === col
                // A shift carries the anchor and everything to its right,
                // so those are marked too: what moves is the point.
                const carried = anchor !== null && col > anchor

                return {
                  className: [
                    'position-dot',
                    selected ? 'is-selected' : '',
                    carried ? 'is-span' : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                  'aria-pressed': selected,
                  onClick: () => toggleAnchor(staff, col),
                  title: selected
                    ? 'Shift the whole row again'
                    : 'Shift this position and everything to its right',
                  'aria-label': `Anchor row ${label(staff)}'s shift at position ${indexInStaff + 1}`,
                }
              }}
            />
          )}

          {/* Edit mode's two strips: circles to pick a stretch out with, and
              under them a paste button per position saying "start the stretch
              here". Both ride inside the scroller so they stay over their own
              positions when a long row is scrolled, and both stand above the
              press-sheet that covers the row — the strip band belongs to
              them, the staff under it picks the row up. */}
          {editing && (
            <>
              <PositionStrip
                className="range-strip"
                label={`Copy range for row ${label(staff)}`}
                start={start}
                cols={cols}
                cell={(col, indexInStaff) => {
                  const end = range?.row === staff && isRangeEnd(col)
                  const spanned = range?.row === staff && inRange(col)

                  return {
                    className: [
                      'position-dot',
                      end ? 'is-selected' : '',
                      spanned && !end ? 'is-span' : '',
                    ]
                      .filter(Boolean)
                      .join(' '),
                    'aria-pressed': Boolean(end || spanned),
                    onClick: () => chooseRangeEnd(staff, col),
                    title:
                      range?.row === staff && range.to === null
                        ? 'Press again to mark the end of the stretch'
                        : 'Mark one end of the stretch to copy',
                    'aria-label': `Copy from position ${indexInStaff + 1} of row ${label(staff)}`,
                  }
                }}
              />
              <PositionStrip
                className="paste-strip"
                label={`Paste into row ${label(staff)}`}
                start={start}
                cols={cols}
                cell={(col, indexInStaff) => ({
                  className: `paste-button${pendingPaste === col ? ' is-armed' : ''}`,
                  disabled: !rangeReady,
                  onClick: () => paste(col),
                  onBlur: cancelPaste,
                  title:
                    pendingPaste === col
                      ? 'Press again to write over the notes already here'
                      : rangeReady
                        ? 'Paste the copied stretch starting here'
                        : 'Pick out a stretch to copy first',
                  'aria-label': `Paste starting at position ${indexInStaff + 1} of row ${label(staff)}`,
                  children: <PasteIcon width={12} height={12} />,
                })}
              />
            </>
          )}

          <div className="staff-body">
            <StaffOverlay
              ties={ties}
              marks={marks}
              staffStart={start}
              cols={cols}
              preview={preview}
            />

            {tuning.map((_, stringIndex) => (
              <div className="string-row" key={stringIndex}>
                {staffColumns.map((column, indexInStaff) => {
                  const col = start + indexInStaff
                  const value = column[stringIndex]
                  const target = isTieTarget(col, stringIndex)
                  const isSource =
                    arming && focused?.col === col && focused?.string === stringIndex

                  return (
                    <input
                      key={col}
                      ref={registerCell(`${col}:${stringIndex}`)}
                      className={[
                        'cell',
                        value ? 'cell--filled' : '',
                        target ? 'cell--tie-target' : '',
                        target && col === cursor ? 'cell--tie-cursor' : '',
                        isSource ? 'cell--tie-source' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      value={value}
                      data-col={col}
                      data-string={stringIndex}
                      // Nothing is written while the order is being edited:
                      // the overlay above takes every press, and this keeps
                      // the cells out of the tab order behind it.
                      readOnly={editing}
                      tabIndex={editing ? -1 : undefined}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck="false"
                      aria-label={`String ${tuning[stringIndex]}, position ${col + 1}`}
                      title={target ? tieHint(col, stringIndex) : undefined}
                      onChange={(event) =>
                        onCellChange(col, stringIndex, normalizeCell(event.target.value))
                      }
                      onMouseDown={(event) => {
                        if (target) {
                          // Taking a tie target keeps the source note
                          // selected, so the press must not move focus here.
                          event.preventDefault()
                          onPlayNote(focused.string, valueAt(focused.col, focused.string))
                          commitTie(focused.col, focused.string, col)
                          return
                        }
                        // Pressing a note sounds it, every press — focus only
                        // changes the first time, so it cannot carry this.
                        onPlayNote(stringIndex, value)
                      }}
                      // Hover aims the same cursor the arrow keys move, so the
                      // preview arc always shows what a press would draw.
                      onMouseEnter={() => target && setCursor(col)}
                      onFocus={(event) => {
                        event.target.select()
                        disarm()
                        // The element rides along so the bar can anchor to it.
                        setFocused({ col, string: stringIndex, element: event.target })
                      }}
                      onBlur={() => {
                        disarm()
                        setFocused(null)
                      }}
                      onDragStart={(event) => event.preventDefault()}
                      onKeyDown={(event) => handleKeyDown(event, col, stringIndex)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Edit mode is where a row other than the last can be taken off
            the sheet, so its one button stands at the end of the staff,
            where the bar controls stand the rest of the time. It has to
            sit above the press-sheet, which covers the whole row. */}
        {editing && (
          <div className="row-bars row-bars--edit">
            <button
              type="button"
              className="bar-button bar-button--delete"
              onClick={() => onDeleteRow(staff)}
              onKeyDown={dropOnEscape}
              disabled={rows.length <= 1}
              title={
                rows.length <= 1
                  ? 'The sheet keeps at least one row'
                  : 'Delete this row — Undo takes it back'
              }
              aria-label={`Delete row ${label(staff)}`}
            >
              <TrashIcon />
            </button>
          </div>
        )}

        {/* The bar controls sit under the overlay, where nothing could
            reach them, and none of what they do is reordering. They stand
            down for as long as the mode is on. */}
        <div className="row-bars" hidden={editing}>
          {/* Shifting a row is the rarer errand of the four, so it is kept
              behind one button and opens out into the two arrows in place,
              above the buttons that change how many bars the row holds. */}
          {shiftRows.has(staff) ? (
            <>
              {/* Nothing else puts the arrows away, so they close on their
                  own terms rather than the moment attention moves. It leads
                  the group it closes, leaving the two arrows side by side. */}
              <button
                type="button"
                className="bar-button bar-button--close"
                onClick={() => closeShift(staff)}
                onKeyDown={closeShiftOnEscape(staff)}
                aria-expanded
                title="Done shifting this row"
                aria-label={`Hide row ${label(staff)}'s shift controls`}
              >
                ×
              </button>
              <button
                type="button"
                className="bar-button"
                // Taken as the arrows appear, so the press that opened them
                // does not leave focus behind on a button that has gone.
                autoFocus
                onClick={() => shift(staff, -1)}
                onKeyDown={closeShiftOnEscape(staff)}
                title="Move this row's notes one position left"
                aria-label={`Move row ${label(staff)}'s notes left`}
              >
                ←
              </button>
              <button
                type="button"
                className="bar-button"
                onClick={() => shift(staff, 1)}
                onKeyDown={closeShiftOnEscape(staff)}
                title="Move this row's notes one position right"
                aria-label={`Move row ${label(staff)}'s notes right`}
              >
                →
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bar-button"
              onClick={() => openShift(staff)}
              aria-expanded={false}
              title="Slide this row's notes along"
              aria-label={`Shift row ${label(staff)}'s notes`}
            >
              ↔
            </button>
          )}
          <button
            type="button"
            className="bar-button"
            onClick={() => onAddBar(staff)}
            title={`Add a bar to this row (${bars} so far)`}
            aria-label={`Add a bar to row ${label(staff)}`}
          >
            +
          </button>
          <button
            type="button"
            className={`bar-button${pendingRemove === staff ? ' is-armed' : ''}`}
            onClick={() => onRemoveBar(staff)}
            onBlur={onCancelRemove}
            disabled={bars <= 1}
            title={
              pendingRemove === staff
                ? 'Press again to delete this bar and the notes in it'
                : `Remove the last bar of this row (${bars} so far)`
            }
            aria-label={`Remove the last bar of row ${label(staff)}`}
          >
            −
          </button>
        </div>
      </div>
    )
  }

  /**
   * Another row for this group, at the foot of the rows it already holds —
   * the only way a row is added, so every group carries one. Dashed and
   * quiet, the way `+ New group` is: somewhere to write rather than something
   * written. It takes no press while the order is being edited, where a press
   * means picking a row up.
   */
  const addRowButton = (groupId) => (
    <button
      type="button"
      className="row-add"
      disabled={editing}
      onClick={() => onAddRow(groupId)}
      title={`Add a row to ${groupLabel(groups, groupId)}`}
    >
      + New row
    </button>
  )

  return (
    <div className="editor">
      {/* Prose about the sheet, at the top of it and folded away until there
          is something to say. It takes no part in edit mode: a note is
          neither a row nor a group, so there is nothing for it to swap with. */}
      <MemoSection memo={memo} onChange={onMemoChange} />

      {/* The running order, under the note and above the staves: what the
          sheet's groups say about the shape of the song, which the staves
          themselves cannot. It takes no part in edit mode either — a block
          there is a group being played, not a row to swap — so its controls
          stand down for as long as a row is being carried. */}
      <ArrangementSection
        groups={groups}
        addable={filledGroups(members, rowIds, groups)}
        arrangement={arrangement}
        editing={editing}
        onAdd={onAddToArrangement}
        onRemove={onRemoveFromArrangement}
      />

      {/* The sheet, top to bottom. A group is a bar across the page with the
          rows it holds indented under it behind a spine in the group's own
          colour, and a row in no group stands on its own where that bracket
          would be. The rows are in sheet order either way: `groupRuns` only
          reads the layout off the order the rows already stand in. */}
      {groupRuns(members, rowIds, groups).flatMap((block) => [
        // Between two blocks, which is a place in no group — and above the
        // bar rather than under it, so it reads as outside the bracket.
        editing ? gap(block.rows[0], null) : null,
        block.group ? (
          <section
            className={`group${isGroupFolded(block.group.id) ? ' group--folded' : ''}`}
            key={`group-${block.group.id}`}
            style={{ '--group': groupTone(block.group.id) }}
            role="group"
            aria-label={groupLabel(groups, block.group.id)}
          >
            <GroupBar
              group={block.group}
              label={groupLabel(groups, block.group.id)}
              rows={block.rows.length}
              bars={block.rows.reduce((n, staff) => n + rows[staff], 0)}
              notes={block.rows.reduce((n, staff) => n + rowNoteCount(grid, rows, staff), 0)}
              folded={isGroupFolded(block.group.id)}
              editing={editing}
              holding={held(block.group.id)}
              onRename={onRenameGroup}
              onToggleFold={toggleGroupFold}
              onDelete={onDeleteGroup}
              onDrop={dropHeldRow}
            />
            {!isGroupFolded(block.group.id) && (
              <div className="group-body">
                {editing ? rowsWithGaps(block.rows, block.group.id) : block.rows.map(staffOf)}
                {addRowButton(block.group.id)}
              </div>
            )}
          </section>
        ) : (
          staffOf(block.rows[0])
        ),
      ])}

      {/* The end of the sheet, past every block. */}
      {editing && gap(rows.length, null)}

      {/* A group holding no rows has no rows to stand over, so it waits at the
          end of the sheet: a bar to name, and somewhere for a row to be sent
          to from its own chip. */}
      {emptyGroups(members, rowIds, groups).map((group) => (
        <section
          className="group group--empty"
          key={`group-${group.id}`}
          style={{ '--group': groupTone(group.id) }}
          role="group"
          aria-label={groupLabel(groups, group.id)}
        >
          <GroupBar
            group={group}
            label={groupLabel(groups, group.id)}
            rows={0}
            bars={0}
            notes={0}
            folded={false}
            editing={editing}
            holding={held(group.id)}
            onRename={onRenameGroup}
            onToggleFold={toggleGroupFold}
            onDelete={onDeleteGroup}
            onDrop={dropHeldRow}
          />
          <div className="group-body">{addRowButton(group.id)}</div>
        </section>
      ))}

      {/* Another group, past the last of them — at a bar's own full width,
          and dashed, the way somewhere to write is drawn rather than
          something written. */}
      <button
        type="button"
        className="group-add"
        disabled={editing}
        onClick={onAddGroup}
        title="Add another group"
      >
        + New group
      </button>

      {!editing && focused && (
        <MarkBar
          anchor={focused.element}
          active={markAt(marks, focused.string, focused.col)}
          onToggle={(symbol) => onToggleMark(focused.col, focused.string, symbol)}
          hasNote={!!focusedValue}
          canTie={targets.length > 0}
          tieArmed={arming}
          onTie={arm}
          canCopy={canCopy}
          onCopy={() => onCopyColumn(focused.col)}
          moves={nudgeMoves(focused.col, focused.string)}
          onNudge={(step) => nudge(focused.col, focused.string, step)}
        />
      )}

    </div>
  )
}
