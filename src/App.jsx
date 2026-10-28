import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NoteLink from './components/NoteLink.jsx'
import Popover from './components/Popover.jsx'
import TabEditor from './components/TabEditor.jsx'
import { PencilIcon, SoundIcon, UndoIcon } from './components/icons.jsx'
import {
  STANDARD_TUNING,
  addBar,
  addRow,
  copyColumn,
  createGrid,
  addGroup,
  createGroups,
  createRowIds,
  createRows,
  downloadFile,
  fitGrid,
  fromJson,
  groupLabel,
  groupOfRow,
  moveRowTo,
  putRowInGroup,
  removeGroup,
  isGridEmpty,
  isSameTie,
  lastBarNoteCount,
  makeTie,
  markAt,
  pasteLoss,
  pasteRange,
  pasteTarget,
  previousWrittenColumn,
  removeBar,
  removeRow,
  rowName,
  rowsInGroup,
  rowNoteCount,
  setGroupName,
  setRowName,
  shiftLoss,
  shiftRow,
  swapRows,
  tiesClash,
  tieTouches,
  toggleMark,
  slugify,
  toAsciiTab,
  toJson,
  totalColumns,
} from './utils/tab.js'
import { HISTORY_LIMIT, nextUndoLabel, popHistory, pushHistory } from './utils/history.js'
import { NOTES_PATH } from './utils/route.js'
import { renderTabToPngBlob } from './utils/renderPng.js'
import { cellFrequency, createAudioEngine } from './utils/audio.js'

const STORAGE_KEY = 'fretboard-notebook:v1'

// A JSON file is parsed in memory before its contents can be validated. This
// keeps a malformed or accidental multi-gigabyte selection from freezing the
// page before `fromJson` can apply its structural limits.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** What the Export menu offers, in the order it lists them. */
const EXPORTS = [
  { key: 'text', name: 'Text file', hint: 'ASCII tab, .txt' },
  { key: 'image', name: 'Image', hint: 'PNG of the staves' },
  { key: 'json', name: 'JSON file', hint: 'Re-open it later' },
  { key: 'clipboard', name: 'Copy', hint: 'ASCII tab to the clipboard' },
]

/** Load the last session so a page refresh never loses written-down fingerings. */
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? fromJson(raw) : null
  } catch {
    return null
  }
}

/**
 * The editor. Normally it holds the one sheet this browser keeps, read from
 * and written back to localStorage as it is worked on.
 *
 * `published` puts it over a note that came from the bucket instead — the
 * object there is the note, and nothing here can change it. Two things follow
 * from that: the sheet is seeded from the note rather than from storage, and
 * the autosave below is off, so reading a published note leaves the reader's
 * own sheet exactly where it was.
 */
export default function App({ published = null }) {
  // Read the note, or localStorage, once and lazily, and seed the state below
  // from whichever it was.
  const [saved] = useState(() => published?.sheet ?? loadSaved())
  const [title, setTitle] = useState(saved?.title ?? '')
  // The note written above the running order: prose about the sheet — a
  // tuning, a capo, what to listen for. Called a memo here because "note"
  // already means a fret on a string, and a published sheet besides.
  const [memo, setMemo] = useState(saved?.memo ?? '')
  // Rows carry their own length in bars, so they lead and the grid follows.
  const [rows, setRows] = useState(() => saved?.rows ?? createRows())
  // One id per row, in row order. A row's id is its name rather than its
  // place, so it travels with the row when the sheet is rearranged.
  const [rowIds, setRowIds] = useState(() => saved?.rowIds ?? createRowIds(saved?.rows?.length))
  // The names rows have been given, keyed by row id — so a name travels with
  // its row the way the id does. Rows nobody has named are absent.
  const [names, setNames] = useState(() => saved?.names ?? {})
  // The groups the sheet holds, and which group each row is in — kept against
  // the row id, so a row carries its group around the page with it. Where a
  // group stands is not kept at all: a group is drawn over the rows it holds,
  // so it stands where they do. A sheet always has at least one group.
  const [groups, setGroups] = useState(() => saved?.groups ?? createGroups())
  const [members, setMembers] = useState(() => saved?.members ?? {})
  const [grid, setGrid] = useState(() => fitGrid(saved?.grid ?? [], saved?.rows ?? createRows()))
  const [ties, setTies] = useState(() => saved?.ties ?? [])
  const [marks, setMarks] = useState(() => saved?.marks ?? [])
  const [status, setStatus] = useState('')
  // Edit mode: the sheet stops taking type and a press picks a row up
  // instead, so two of them can be swapped. Not saved with the sheet — it is
  // a way of handling the page, not a property of the song.
  const [editing, setEditing] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  // Row whose minus button is armed, waiting for a second press.
  const [pendingRemove, setPendingRemove] = useState(null)
  const [showText, setShowText] = useState(false)
  // The Export button's element while its menu is open, so the menu can anchor.
  const [exportMenu, setExportMenu] = useState(null)
  const [audioOn, setAudioOn] = useState(false)
  const fileInputRef = useRef(null)
  // Set when + New row is pressed, so the effect that scrolls to it knows to.
  const revealNewRow = useRef(false)
  // Deliberately not restored from a saved session: a page should not be able
  // to start making noise before the reader has asked for it.
  const audioRef = useRef(null)

  const sheet = useMemo(
    () => ({ grid, rows, rowIds, names, groups, members, ties, marks }),
    [grid, rows, rowIds, names, groups, members, ties, marks],
  )
  const asciiTab = useMemo(() => toAsciiTab(sheet, STANDARD_TUNING), [sheet])
  const empty = useMemo(() => isGridEmpty(grid), [grid])

  // The sheet as it stood before each of the last few actions, oldest first.
  // Bounded by HISTORY_LIMIT, so this is a short way back rather than a record
  // of the session.
  const [history, setHistory] = useState([])

  // The sheet as it stands now, for `remember` to take its snapshot from. It
  // is read through a ref rather than closed over so that the handlers which
  // are deliberately built once — the memoised ones the editor is given — can
  // still snapshot the sheet without being rebuilt on every change to it.
  const sheetRef = useRef(sheet)
  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])

  /**
   * Put away the bar minus button waiting on a second press. It is armed
   * against the sheet as it stood when the warning was shown, so a sheet that
   * has changed since disarms it rather than letting the next press delete
   * against a warning the reader has stopped reading.
   */
  const disarmRemovals = () => {
    setPendingRemove(null)
  }

  /**
   * Take down how the editor stands, for the Undo button to put back. A
   * handler calls this on the path where it is about to change something, and
   * not on the paths where it only arms a button or refuses, so a press that
   * changed nothing does not cost a step of history.
   *
   * `label` finishes the sentence "Undid …". `token` names the cell for the
   * edits that arrive a keystroke at a time; see pushHistory. `extra` carries
   * the fields outside the sheet that an action also rewrites, so that undoing
   * it puts those back too.
   */
  const remember = useCallback((label, { token = null, extra = null } = {}) => {
    setHistory((prev) =>
      pushHistory(prev, { label, token, state: { ...sheetRef.current, ...extra } }),
    )
  }, [])

  /**
   * Put a new sheet in place. The shaping helpers in tab.js each return only
   * the pieces their change touches, and an undo snapshot holds only the
   * pieces its action rewrote, so whatever is absent here is left standing.
   */
  const applySheet = useCallback((next) => {
    if (next.rows) setRows(next.rows)
    if (next.rowIds) setRowIds(next.rowIds)
    if (next.names) setNames(next.names)
    if (next.groups) setGroups(next.groups)
    if (next.members) setMembers(next.members)
    if (next.grid) setGrid(next.grid)
    if (next.ties) setTies(next.ties)
    if (next.marks) setMarks(next.marks)
    if (next.title !== undefined) setTitle(next.title)
    if (next.memo !== undefined) setMemo(next.memo)
  }, [])

  /**
   * Step back one action. Every snapshot is the sheet as it stood before the
   * action that took it, so applying the newest and dropping it walks back
   * through the stack a press at a time. Anything waiting on a second press
   * was armed against the sheet this undoes, so it is put away with it.
   */
  const handleUndo = () => {
    const { stack, entry } = popHistory(history)
    if (!entry) return

    setHistory(stack)
    applySheet(entry.state)
    disarmRemovals()
    setConfirmingClear(false)
    setStatus(`Undid ${entry.label}`)
  }

  /** The number in a row's circle — where the row stands on the page. */
  const rowLabel = (rowIndex) => rowIndex + 1

  /**
   * Name a row, or clear its name by passing an empty one. The name is kept
   * against the row's own id rather than its place, so it stays with the row
   * when the sheet is reordered and goes when the row does.
   *
   * A press that leaves the name as it was — opening the box and closing it
   * again, or retyping the same name — changes nothing and costs no undo.
   */
  const handleRenameRow = (rowIndex, name) => {
    const id = rowIds[rowIndex]
    const next = setRowName(names, id, name)
    const written = rowName(next, id)
    if (written === rowName(names, id)) return

    remember(`naming row ${rowLabel(rowIndex)}`)
    setNames(next)
    setStatus(
      written
        ? `Row ${rowLabel(rowIndex)} is now "${written}"`
        : `Row ${rowLabel(rowIndex)} has no name again`,
    )
  }

  /**
   * Write the sheet's note. It arrives a keystroke at a time, so the whole
   * run counts as one step of history — `memo` as the token is what holds it
   * together — and the note itself rides along as an extra, since it is not
   * part of the sheet the staves are drawn from.
   */
  const handleMemoChange = (next) => {
    if (next === memo) return
    remember('writing the note', { token: 'memo', extra: { memo } })
    setMemo(next)
  }

  /**
   * Append an empty row at the bottom and scroll down to it. A new row starts
   * outside every group: groups collect the rows that are already written,
   * which is what their own lists are for.
   */
  const handleAddRow = () => {
    remember('adding a row')
    const next = addRow(sheet)
    // The scroll has to wait for the row to be laid out, so it is left to the
    // effect below rather than run here, where the page is still its old height.
    revealNewRow.current = true
    setRows(next.rows)
    setRowIds(next.rowIds)
    setGrid(next.grid)
    disarmRemovals()
  }

  /**
   * Add an empty group. It holds no rows yet, so it waits as a bar at the end
   * of the sheet until one is sent to it.
   */
  const handleAddGroup = () => {
    remember('adding a group')
    const next = addGroup(groups)
    setGroups(next)
    setStatus(`Added ${groupLabel(next, next[next.length - 1].id)}`)
  }

  /**
   * Name a group, or clear its name by passing an empty one. A group with no
   * name of its own is called after where it stands, so clearing one leaves
   * it named rather than nameless.
   */
  const handleRenameGroup = (groupId, name) => {
    const next = setGroupName(groups, groupId, name)
    if (groupLabel(next, groupId) === groupLabel(groups, groupId)) return

    remember(`naming ${groupLabel(groups, groupId)}`)
    setGroups(next)
    setStatus(`That group is now ${groupLabel(next, groupId)}`)
  }

  /**
   * Take a group off the sheet. The rows it held stay exactly where they
   * stand and are in no group afterwards — the bar goes, the music does not,
   * which is why this goes on one press with Undo as the way back rather
   * than asking first.
   */
  const handleDeleteGroup = (groupId) => {
    const was = groupLabel(groups, groupId)
    const held = rowsInGroup(members, rowIds, groupId).length

    remember(`deleting ${was}`)
    applySheet(removeGroup(groups, members, groupId))
    setStatus(
      held
        ? `Deleted ${was} — its ${held === 1 ? 'row is' : `${held} rows are`} in no group now`
        : `Deleted ${was}`,
    )
  }

  /**
   * Put a row in a group, or take it out of the one it is in with null.
   *
   * A group is drawn as one bar over the rows it holds, so this moves the row
   * as well: it joins the end of its new group's run, or drops just past the
   * run it has left. The row therefore has a new number afterwards, which is
   * what the sheet is told about — the old one no longer points at it.
   */
  const handleSetRowGroup = (rowIndex, groupId) => {
    if (groupOfRow(members, rowIds[rowIndex]) === groupId) return

    remember(`moving row ${rowLabel(rowIndex)}`)
    const next = putRowInGroup(sheet, rowIndex, groupId)
    applySheet(next)
    disarmRemovals()
    setStatus(
      Number.isInteger(groupId)
        ? `Row ${rowLabel(next.at)} is in ${groupLabel(groups, groupId)}`
        : `Row ${rowLabel(next.at)} is in no group`,
    )
  }

  /**
   * Move a row to a place between two others, and into whatever group that
   * place belongs to. The other half of edit mode's reordering: a swap trades
   * two rows, this one takes a row somewhere else and lets everything between
   * close up behind it.
   */
  const handleMoveRow = (from, to, groupId) => {
    remember(`moving row ${rowLabel(from)}`)
    const next = moveRowTo(sheet, from, to, groupId)
    applySheet(next)
    disarmRemovals()
    setStatus(
      `Row ${rowLabel(from)} moved to row ${rowLabel(next.at)}` +
        (Number.isInteger(groupId) ? `, in ${groupLabel(groups, groupId)}` : ', in no group'),
    )
  }

  /**
   * Exchange two rows, the tab written in them and all. A row's name travels
   * with the music, since it is kept against the row's id; which group a row
   * is in stays behind with the place it stood, so a row swapped into a
   * group's run joins that group — see `swapRows`.
   */
  const handleSwapRows = useCallback(
    (a, b) => {
      remember(`swapping rows ${a + 1} and ${b + 1}`)
      applySheet(swapRows(sheetRef.current, a, b))
      disarmRemovals()
      setStatus(`Swapped rows ${a + 1} and ${b + 1}`)
    },
    [applySheet, remember],
  )

  /**
   * Take one row off the sheet, wherever it stands: the grid loses its run of
   * columns, the rows below slide up, and the name and group the row was
   * given go with it. Both ways of deleting a row end up here, so the two
   * buttons differ only in which row they name and how they ask first.
   */
  const applyRemoveRow = (rowIndex) => {
    remember(`deleting row ${rowLabel(rowIndex)}`)
    applySheet(removeRow(sheet, rowIndex))
    disarmRemovals()
  }

  /**
   * Delete one row, wherever it stands. It goes on the press that asks for
   * it: Undo is the way back now, and a second press to confirm would stand
   * between the reader and a row they can have again anyway. What went is
   * said out loud instead, since a whole row's notes are worth accounting for.
   * The sheet never drops below a single row.
   */
  const handleDeleteRow = (rowIndex) => {
    if (rows.length <= 1 || rowIndex < 0 || rowIndex >= rows.length) return

    const row = rowLabel(rowIndex)
    const notes = rowNoteCount(grid, rows, rowIndex)
    applyRemoveRow(rowIndex)
    setStatus(
      notes > 0
        ? `Deleted row ${row} — ${notes} note${notes === 1 ? '' : 's'}`
        : `Deleted row ${row}`,
    )
  }

  /** What − Remove row asks for: the bottom row, by the same one press. */
  const handleRemoveRow = () => handleDeleteRow(rows.length - 1)

  useEffect(() => {
    if (!revealNewRow.current) return
    revealNewRow.current = false
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, [rows])

  /**
   * Widen one row by a bar. All four pieces move together — the columns are
   * inserted mid-grid, so the ties and symbols after them shift too — which is
   * why this works off the whole sheet rather than four separate updates.
   */
  const handleAddBar = (rowIndex) => {
    remember(`adding a bar to row ${rowLabel(rowIndex)}`)
    const next = addBar(sheet, rowIndex)
    setRows(next.rows)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    disarmRemovals()
  }

  /**
   * Slide part of a row along by a position, from `anchor` back to whichever
   * end of the row is behind it — the whole row when nothing is anchored. A
   * shift always costs one position's worth of notes, either written over or
   * pushed off the end, which is worth saying out loud even though it is what
   * was asked for.
   */
  const handleShiftRow = (rowIndex, step, anchor = null) => {
    const lost = shiftLoss(grid, rows, rowIndex, step, anchor)
    remember(`shifting row ${rowLabel(rowIndex)}`)
    const next = shiftRow(sheet, rowIndex, step, anchor)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    disarmRemovals()
    if (lost.notes > 0) {
      setStatus(
        `Shifted row ${rowLabel(rowIndex)} — ${lost.notes} note${lost.notes === 1 ? '' : 's'} ${
          lost.overwritten ? 'written over' : 'fell off the end'
        }`,
      )
    }
  }

  /**
   * Take the last bar off a row. Doing that to a bar with notes in it throws
   * work away, so the first press only arms the button and says what would be
   * lost; the second press is the one that removes it. An empty bar goes
   * straight away — there is nothing to warn about.
   */
  const handleRemoveBar = (rowIndex) => {
    if (rows[rowIndex] <= 1) return

    const notes = lastBarNoteCount(grid, rows, rowIndex)
    if (notes > 0 && pendingRemove !== rowIndex) {
      setPendingRemove(rowIndex)
      setStatus(`Last bar of row ${rowLabel(rowIndex)} holds ${notes} note${notes === 1 ? '' : 's'} — press again to delete`)
      return
    }

    remember(`deleting a bar from row ${rowLabel(rowIndex)}`)
    const next = removeBar(sheet, rowIndex)
    setRows(next.rows)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    disarmRemovals()
    if (notes > 0) setStatus(`Deleted ${notes} note${notes === 1 ? '' : 's'}`)
  }

  useEffect(() => {
    // A published note is the server's, and the reader has a sheet of their
    // own that this one is only being read in front of. Saving here would
    // write over it, so a note is read and nothing more.
    if (published) return
    try {
      localStorage.setItem(STORAGE_KEY, toJson({ ...sheet, memo }, STANDARD_TUNING, title))
    } catch {
      // Private-mode / quota failures are not worth interrupting the user for.
    }
  }, [published, sheet, memo, title])

  useEffect(() => {
    if (!status) return undefined
    const timer = setTimeout(() => {
      setStatus('')
      // An armed minus button is only armed for as long as its warning is on
      // screen; once that has gone, the next press asks again rather than
      // deleting something the reader has stopped expecting it to.
      setPendingRemove(null)
    }, 2400)
    return () => clearTimeout(timer)
  }, [status])

  useEffect(() => () => audioRef.current?.close(), [])

  const toggleAudio = () => {
    if (audioOn) {
      setAudioOn(false)
      return
    }
    // Built here, inside the click: browsers only let audio start from a gesture.
    if (!audioRef.current) audioRef.current = createAudioEngine()
    if (!audioRef.current) {
      setStatus('This browser cannot play audio')
      return
    }
    audioRef.current.resume()
    setAudioOn(true)
  }

  /**
   * Turn edit mode on or off. It is the one mode the sheet has: the whole of
   * working on a sheet rather than writing in it — picking a row up to swap
   * it, sending a row to a group, deleting a row, and picking a stretch of
   * notes out to write down again elsewhere.
   *
   * It takes the sheet over — cells stop accepting type, and a press picks
   * the row out rather than putting the cursor in it — so anything half-armed
   * underneath is put away rather than left waiting for a press that can no
   * longer reach it.
   */
  const toggleEditing = () => {
    const next = !editing
    setEditing(next)
    disarmRemovals()
    setStatus(next ? 'Edit mode on' : '')
  }

  /**
   * Write a copied stretch down starting at `at`. The decision of whether to
   * ask first lives here rather than in the view, because what it turns on —
   * how many notes are standing where the stretch would land — is a question
   * about the sheet.
   *
   * Returns 'confirm' when the caller should arm itself and come back, which
   * is what the second press sets `confirmed` for.
   */
  const handlePasteRange = useCallback(
    (range, at, confirmed) => {
      const { fits } = pasteTarget(rows, range, at)
      if (!fits) {
        const length = range.to - range.from + 1
        setStatus(`That stretch is ${length} positions long and will not fit here`)
        return 'refused'
      }

      const losing = pasteLoss(grid, rows, range, at)
      if (losing > 0 && !confirmed) {
        setStatus(
          `Pasting here writes over ${losing} note${losing === 1 ? '' : 's'} — press again to paste`,
        )
        return 'confirm'
      }

      remember('pasting')
      const next = pasteRange(sheet, range, at)
      setGrid(next.grid)
      setTies(next.ties)
      setMarks(next.marks)
      const length = range.to - range.from + 1
      setStatus(`Pasted ${length} position${length === 1 ? '' : 's'}`)
      return 'pasted'
    },
    [sheet, grid, rows, remember],
  )

  /** Sound one written note. Silent for empty positions and muted strings. */
  const playNote = useCallback(
    (stringIndex, value) => {
      if (!audioOn) return
      const frequency = cellFrequency(value, stringIndex)
      if (frequency !== null) audioRef.current?.play(frequency)
    },
    [audioOn],
  )

  /** Sound a whole position at once — every string written in one column. */
  const playColumn = useCallback(
    (col) => {
      grid[col]?.forEach((value, stringIndex) => playNote(stringIndex, value))
    },
    [grid, playNote],
  )

  /**
   * Fill the selected position with the last one written before it — the same
   * chord played again, taken from where it stands rather than typed out a
   * second time. It sounds as it lands, like any other note pressed.
   */
  const handleCopyColumn = useCallback(
    (col) => {
      const source = previousWrittenColumn(grid, col)
      if (source < 0) return

      remember('copying a chord')
      const next = copyColumn(sheet, source, col)
      setGrid(next.grid)
      setTies(next.ties)
      setMarks(next.marks)
      // The source still holds what the target is about to, so this is the
      // chord that has just been written, played from where it was copied.
      playColumn(source)
    },
    [grid, sheet, playColumn, remember],
  )

  /**
   * Write one cell, taking no snapshot. The two corrections below — sending a
   * note to another string, finishing an arc — are each one action made of
   * more than one cell write, so they snapshot once themselves and come
   * straight here rather than back through handleCellChange.
   */
  const writeCell = useCallback((col, stringIndex, value) => {
    setGrid((prev) => {
      if (col < 0 || col >= prev.length || prev[col][stringIndex] === value) return prev
      return prev.map((column, i) =>
        i === col ? column.map((cell, s) => (s === stringIndex ? value : cell)) : column,
      )
    })
    // Erasing a note takes any arc or symbol anchored to it with it.
    if (value === '') {
      setTies((prev) => prev.filter((tie) => !tieTouches(tie, stringIndex, col)))
      setMarks((prev) =>
        prev.filter((mark) => !(mark.string === stringIndex && mark.col === col)),
      )
    }
  }, [])

  /**
   * Write one cell as an action of its own. A run of these in the same cell is
   * one step back rather than one per keystroke — five steps of history should
   * be five things done, not five characters typed — which is what the cell's
   * token is for. The no-op check that writeCell makes again inside its
   * updater is made here first, so that typing a fret the cell already holds
   * does not spend a step either.
   */
  const handleCellChange = useCallback(
    (col, stringIndex, value) => {
      const { grid: written } = sheetRef.current
      if (col < 0 || col >= written.length || written[col][stringIndex] === value) return

      remember(value === '' ? 'erasing a note' : 'writing a note', {
        token: `cell:${col}:${stringIndex}`,
      })
      writeCell(col, stringIndex, value)
    },
    [remember, writeCell],
  )

  /**
   * Send a written note to another string without changing its pitch — the
   * correction for one written on the wrong string. Its symbol
   * travels with it. An arc cannot: both ends of one live on the same string,
   * so an arc ending on the note goes the way it would if the note had been
   * erased, which is what clearing the old position does.
   */
  const handleNudgeNote = useCallback(
    (col, fromString, toString, fret) => {
      const symbol = markAt(marks, fromString, col)
      remember('sending a note to another string')
      writeCell(col, fromString, '')
      writeCell(col, toString, String(fret))
      if (symbol) setMarks((prev) => toggleMark(prev, toString, col, symbol))
    },
    [marks, remember, writeCell],
  )

  const handleToggleMark = useCallback(
    (col, stringIndex, symbol) => {
      // Read through the ref so that this stays built once: toggleMark drops
      // the symbol it is handed and writes any other, so which of the two
      // happened is worth saying.
      const standing = markAt(sheetRef.current.marks, stringIndex, col) === symbol
      remember(standing ? 'removing a symbol' : 'adding a symbol')
      setMarks((prev) => toggleMark(prev, stringIndex, col, symbol))
    },
    [remember],
  )

  /**
   * Finish a tie. An empty destination takes the source's fret; one that
   * already holds a note keeps its own and is simply joined to the source.
   * Tying the same pair again removes the arc, which is the only way to undo
   * one without erasing a note.
   */
  const createTie = (stringIndex, sourceCol, targetCol) => {
    const value = grid[sourceCol]?.[stringIndex]
    const existing = grid[targetCol]?.[stringIndex]
    if (!value || sourceCol === targetCol) return

    const tie = makeTie(stringIndex, sourceCol, targetCol)
    if (ties.some((existingTie) => isSameTie(existingTie, tie))) {
      remember('removing an arc')
      setTies((prev) => prev.filter((existingTie) => !isSameTie(existingTie, tie)))
      return
    }

    remember('adding an arc')
    if (!existing) writeCell(targetCol, stringIndex, value)
    // A note carries one arc back and one on, so a new arc replaces only what
    // hung off the same side — the other side is left as it was, which is how
    // a note comes to be held right through a run of positions.
    setTies((prev) => [...prev.filter((existingTie) => !tiesClash(existingTie, tie)), tie])
  }

  const fileStem = slugify(title)

  /** What the Undo button would take back, or null when it would do nothing. */
  const undoing = nextUndoLabel(history)

  const exportText = () => {
    downloadFile(`${fileStem}.txt`, asciiTab, 'text/plain')
    setStatus('Saved text tab')
  }

  const exportJson = () => {
    downloadFile(
      `${fileStem}.json`,
      toJson({ ...sheet, memo }, STANDARD_TUNING, title),
      'application/json',
    )
    setStatus('Saved JSON')
  }

  const exportPng = async () => {
    const blob = await renderTabToPngBlob(sheet, STANDARD_TUNING, title)
    if (!blob) {
      setStatus('Could not render image')
      return
    }
    downloadFile(`${fileStem}.png`, blob)
    setStatus('Saved image')
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(asciiTab)
      setStatus('Copied to clipboard')
    } catch {
      setStatus('Clipboard blocked — save a text file instead')
    }
  }

  /** Run one of the EXPORTS and put the menu away. */
  const runExport = (key) => {
    setExportMenu(null)
    if (key === 'text') exportText()
    else if (key === 'image') exportPng()
    else if (key === 'json') exportJson()
    else if (key === 'clipboard') copyText()
  }

  const importJson = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus('That file is too large to import')
      return
    }
    const parsed = fromJson(await file.text())
    if (!parsed) {
      setStatus('That file is not a Fretboard Notebook export')
      return
    }
    // Opening a file replaces the title and the note as well as the sheet, so
    // the snapshot carries those two along: undoing an import that was meant
    // for another window puts the whole page back, not just the staves.
    remember(`opening ${file.name}`, { extra: { title, memo } })
    applySheet({ ...parsed, grid: fitGrid(parsed.grid, parsed.rows) })
    disarmRemovals()
    setStatus(`Opened ${file.name}`)
  }

  const clearAll = () => {
    const fresh = createRows()
    remember('clearing the sheet')
    applySheet({
      rows: fresh,
      rowIds: createRowIds(fresh.length),
      names: {},
      groups: createGroups(),
      members: {},
      grid: createGrid(totalColumns(fresh)),
      ties: [],
      marks: [],
      memo: '',
    })
    disarmRemovals()
    setConfirmingClear(false)
    setStatus('Cleared')
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Fretboard Notebook</h1>
        <input
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled"
          aria-label="Title"
        />
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            onClick={(event) => setExportMenu(exportMenu ? null : event.currentTarget)}
            disabled={empty}
            aria-haspopup="dialog"
            aria-expanded={!!exportMenu}
          >
            Export
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <button
            type="button"
            className={confirmingClear ? 'danger' : ''}
            onClick={() => (confirmingClear ? clearAll() : setConfirmingClear(true))}
            onBlur={() => setConfirmingClear(false)}
            disabled={empty}
          >
            {confirmingClear ? 'Clear everything?' : 'Clear'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={importJson}
          />
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className={`icon-button${editing ? ' is-on' : ''}`}
            aria-pressed={editing}
            aria-label={editing ? 'Finish editing' : 'Edit the sheet'}
            onClick={toggleEditing}
            title={
              editing
                ? 'Edit mode — swap rows, move one into a group, or copy a stretch of notes'
                : 'Rearrange the rows and copy notes about'
            }
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className={`icon-button${audioOn ? ' is-on' : ''}`}
            aria-pressed={audioOn}
            aria-label={audioOn ? 'Sound on' : 'Sound off'}
            onClick={toggleAudio}
            title={
              audioOn ? 'Sound is on — hear each note as you press it' : 'Sound is off'
            }
          >
            <SoundIcon muted={!audioOn} />
          </button>
        </div>

        <span className="status" role="status">
          {status}
        </span>

        <div className="toolbar-group toolbar-group--end">
          {/* Undo stands apart from the buttons that do things to the sheet,
              on the near side of the one control that leaves the editor: it is
              reached after one of them has gone wrong rather than alongside
              them, and it is the same button whatever the last action was. */}
          <button
            type="button"
            className="icon-button"
            onClick={handleUndo}
            disabled={history.length === 0}
            aria-label={undoing ? `Undo ${undoing}` : 'Nothing to undo'}
            title={
              undoing
                ? `Undo ${undoing} — ${history.length} of ${HISTORY_LIMIT} steps kept`
                : `Nothing to undo — the last ${HISTORY_LIMIT} actions can be taken back`
            }
          >
            <UndoIcon />
          </button>
          {/* Leaves the editor, so it sits at the far end, clear of every
              button that acts on the sheet. */}
          <NoteLink to={NOTES_PATH} className="button-link">
            Browse
          </NoteLink>
        </div>
      </div>

      {/* The status line beside the buttons clears itself after a few seconds,
          which is right for something that has just happened and wrong for a
          mode that is still on. So the mode says what it is here instead. */}
      {editing && (
        <p className="edit-hint">
          Press a row, then press another, and the two exchange places — a row
          swapped into a group joins it. While a row is held, the lines between
          the rows light up: press one to move the held row there instead of
          swapping it, and a line inside a group&rsquo;s bracket puts it in that
          group. A group&rsquo;s bar takes the held row too, or lets it go. The bin
          at the end of a row deletes that row. Above each staff, press two circles to pick a
          stretch of notes out — one row at a time — then a paste button to
          write it down starting there. Writing is off until this is turned
          back off.
        </p>
      )}

      {exportMenu && (
        <Popover
          anchor={exportMenu}
          className="export-menu"
          label="Export"
          onClose={() => setExportMenu(null)}
        >
          {EXPORTS.map(({ key, name, hint }) => (
            <button key={key} type="button" className="export-option" onClick={() => runExport(key)}>
              <span className="export-name">{name}</span>
              <span className="export-hint">{hint}</span>
            </button>
          ))}
        </Popover>
      )}

      <main className="sheet">
        <TabEditor
          grid={grid}
          rows={rows}
          rowIds={rowIds}
          names={names}
          groups={groups}
          members={members}
          tuning={STANDARD_TUNING}
          ties={ties}
          marks={marks}
          memo={memo}
          onMemoChange={handleMemoChange}
          editing={editing}
          onSwapRows={handleSwapRows}
          onRenameRow={handleRenameRow}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onSetRowGroup={handleSetRowGroup}
          onMoveRow={handleMoveRow}
          onDeleteGroup={handleDeleteGroup}
          onCellChange={handleCellChange}
          onCreateTie={createTie}
          onToggleMark={handleToggleMark}
          onPlayNote={playNote}
          onAddBar={handleAddBar}
          onShiftRow={handleShiftRow}
          onRemoveBar={handleRemoveBar}
          onCopyColumn={handleCopyColumn}
          onNudgeNote={handleNudgeNote}
          onStatus={setStatus}
          onPasteRange={handlePasteRange}
          pendingRemove={pendingRemove}
          onCancelRemove={() => setPendingRemove(null)}
          onDeleteRow={handleDeleteRow}
        />
      </main>

      <div className="sheet-actions">
        <button type="button" onClick={handleAddRow} disabled={editing}>
          + New row
        </button>
        <button
          type="button"
          onClick={handleRemoveRow}
          disabled={editing || rows.length <= 1}
        >
          − Remove row
        </button>
      </div>

      <section className="output">
        <button type="button" className="link" onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide' : 'Show'} text output
        </button>
        {showText && <pre className="output-pre">{empty ? '(nothing written yet)' : asciiTab}</pre>}
      </section>
    </div>
  )
}
