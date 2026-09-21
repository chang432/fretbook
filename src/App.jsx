import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveMode from './components/LiveMode.jsx'
import Popover from './components/Popover.jsx'
import TabEditor from './components/TabEditor.jsx'
import { CopyIcon, PresentIcon, SoundIcon, SwapIcon } from './components/icons.jsx'
import {
  DEFAULT_BPM,
  MAX_BPM,
  MIN_BPM,
  STANDARD_TUNING,
  addBar,
  addRow,
  clampBpm,
  copyColumn,
  createGrid,
  createGroups,
  createRows,
  downloadFile,
  fitGrid,
  fromJson,
  isGridEmpty,
  isSameTie,
  lastBarNoteCount,
  lastRowNoteCount,
  makeTie,
  markAt,
  pasteLoss,
  pasteRange,
  pasteTarget,
  previousWrittenColumn,
  removeBar,
  removeRow,
  setGroupRepeat,
  setGroupSlot,
  shiftLoss,
  shiftRow,
  swapGroupSlots,
  swapRows,
  tiesClash,
  tieTouches,
  toggleMark,
  slugify,
  toAsciiTab,
  toJson,
  totalColumns,
} from './utils/tab.js'
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

export default function App() {
  // Read localStorage once, lazily, and seed both pieces of state from it.
  const [saved] = useState(loadSaved)
  const [title, setTitle] = useState(saved?.title ?? '')
  // Rows carry their own length in bars, so they lead and the grid follows.
  const [rows, setRows] = useState(() => saved?.rows ?? createRows())
  // One group id per row, in row order. A row's id is its name rather than
  // its place, so it travels with the row when the sheet is rearranged.
  const [groups, setGroups] = useState(() => saved?.groups ?? createGroups(saved?.rows?.length))
  const [grid, setGrid] = useState(() => fitGrid(saved?.grid ?? [], saved?.rows ?? createRows()))
  const [ties, setTies] = useState(() => saved?.ties ?? [])
  const [marks, setMarks] = useState(() => saved?.marks ?? [])
  // The running order above the staves: one slot per position in the song,
  // holding the row played there and how many times over.
  const [structure, setStructure] = useState(() => saved?.structure ?? [])
  const [status, setStatus] = useState('')
  // Edit mode: the sheet stops taking type and a press picks a row or a group
  // slot up instead, so two of them can be swapped. Not saved with the sheet —
  // it is a way of handling the page, not a property of the song.
  const [editing, setEditing] = useState(false)
  // Whether copy mode is on: the strips above every staff that pick a stretch
  // of positions out and write it down again elsewhere. Not saved with the
  // session — it is an errand, not a property of the song.
  const [copying, setCopying] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  // Row whose minus button is armed, waiting for a second press.
  const [pendingRemove, setPendingRemove] = useState(null)
  const [confirmingRemoveRow, setConfirmingRemoveRow] = useState(false)
  const [showText, setShowText] = useState(false)
  // The Export button's element while its menu is open, so the menu can anchor.
  const [exportMenu, setExportMenu] = useState(null)
  const [audioOn, setAudioOn] = useState(false)
  // Playback tempo, and the Live button's element while it is asking for one.
  const [bpm, setBpm] = useState(() => saved?.bpm ?? DEFAULT_BPM)
  const [liveMenu, setLiveMenu] = useState(null)
  const [bpmDraft, setBpmDraft] = useState('')
  // Chosen for this launch only: a presentation should not unexpectedly open
  // without its transport controls on a later visit.
  const [simpleLiveMode, setSimpleLiveMode] = useState(false)
  const [live, setLive] = useState(false)
  const fileInputRef = useRef(null)
  // Set when + New row is pressed, so the effect that scrolls to it knows to.
  const revealNewRow = useRef(false)
  // Deliberately not restored from a saved session: a page should not be able
  // to start making noise before the reader has asked for it.
  const audioRef = useRef(null)

  const sheet = useMemo(
    () => ({ grid, rows, groups, ties, marks, structure }),
    [grid, rows, groups, ties, marks, structure],
  )
  const asciiTab = useMemo(() => toAsciiTab(sheet, STANDARD_TUNING), [sheet])
  const empty = useMemo(() => isGridEmpty(grid), [grid])

  const lastRowNotes = useMemo(() => lastRowNoteCount(grid, rows), [grid, rows])

  /** The number in a row's circle — its group id, counting from one. */
  const rowLabel = (rowIndex) => groups[rowIndex] + 1

  /** Append an empty row at the bottom and scroll down to it. */
  const handleAddRow = () => {
    const next = addRow(sheet)
    // The scroll has to wait for the row to be laid out, so it is left to the
    // effect below rather than run here, where the page is still its old height.
    revealNewRow.current = true
    setRows(next.rows)
    setGroups(next.groups)
    setGrid(next.grid)
    setPendingRemove(null)
    setConfirmingRemoveRow(false)
  }

  /** Put a group in one slot of the running order, or clear it with null. */
  const handleSetGroup = useCallback((slot, group) => {
    setStructure((prev) => setGroupSlot(prev, slot, group))
  }, [])

  /** Say how many times one slot of the running order plays its group. */
  const handleSetGroupRepeat = useCallback((slot, repeat) => {
    setStructure((prev) => setGroupRepeat(prev, slot, repeat))
  }, [])

  /**
   * Exchange two rows, the tab written in them and all. The running order is
   * not touched: its slots name groups by position, so the strip goes on
   * saying what it said and the song changes with the rows. Reordering the
   * strip is its own swap, and the two never reach into each other.
   */
  const handleSwapRows = useCallback(
    (a, b) => {
      const next = swapRows(sheet, a, b)
      setRows(next.rows)
      setGroups(next.groups)
      setGrid(next.grid)
      setTies(next.ties)
      setMarks(next.marks)
      setPendingRemove(null)
      setConfirmingRemoveRow(false)
      // Read straight off `groups` rather than through rowLabel, which is
      // rebuilt each render and would keep this callback from being memoised.
      setStatus(`Swapped groups ${groups[a] + 1} and ${groups[b] + 1}`)
    },
    [sheet, groups],
  )

  /** Exchange two positions of the running order, which reorders the song. */
  const handleSwapGroupSlots = useCallback((a, b) => {
    setStructure((prev) => swapGroupSlots(prev, a, b))
    setStatus(`Swapped positions ${a + 1} and ${b + 1} of the running order`)
  }, [])

  /**
   * Drop the last row. An empty one goes straight away; one with notes in it
   * says what would be lost and waits for a second press, the same bargain the
   * Clear button and the per-row minus buttons make.
   */
  const handleRemoveRow = () => {
    if (rows.length <= 1) return
    if (lastRowNotes > 0 && !confirmingRemoveRow) {
      setConfirmingRemoveRow(true)
      return
    }

    const next = removeRow(sheet)
    setRows(next.rows)
    setGroups(next.groups)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    setStructure(next.structure)
    setPendingRemove(null)
    setConfirmingRemoveRow(false)
    if (lastRowNotes > 0) {
      setStatus(`Deleted ${lastRowNotes} note${lastRowNotes === 1 ? '' : 's'}`)
    }
  }

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
    const next = addBar(sheet, rowIndex)
    setRows(next.rows)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    setPendingRemove(null)
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
    const next = shiftRow(sheet, rowIndex, step, anchor)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    setPendingRemove(null)
    if (lost.notes > 0) {
      setStatus(
        `Shifted group ${rowLabel(rowIndex)} — ${lost.notes} note${lost.notes === 1 ? '' : 's'} ${
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
      setStatus(`Last bar of group ${rowLabel(rowIndex)} holds ${notes} note${notes === 1 ? '' : 's'} — press again to delete`)
      return
    }

    const next = removeBar(sheet, rowIndex)
    setRows(next.rows)
    setGrid(next.grid)
    setTies(next.ties)
    setMarks(next.marks)
    setPendingRemove(null)
    if (notes > 0) setStatus(`Deleted ${notes} note${notes === 1 ? '' : 's'}`)
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, toJson({ ...sheet, bpm }, STANDARD_TUNING, title))
    } catch {
      // Private-mode / quota failures are not worth interrupting the user for.
    }
  }, [sheet, bpm, title])

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
   * Turn edit mode on or off. It takes the sheet over — cells stop accepting
   * type, and a press picks the row out rather than putting the cursor in it —
   * so anything half-armed underneath is put away rather than left waiting for
   * a press that can no longer reach it.
   */
  const toggleEditing = () => {
    const next = !editing
    setEditing(next)
    setPendingRemove(null)
    setConfirmingRemoveRow(false)
    // The two modes both take the sheet over and would draw over each other,
    // so reaching for one puts the other away.
    if (next) setCopying(false)
    setStatus(next ? 'Edit mode on' : '')
  }

  /**
   * Turn copy mode on or off. It adds two strips above every staff — circles
   * to pick a stretch of positions out with, and a paste button per position —
   * and leaves writing alone underneath, since nothing it does competes with
   * the cursor.
   */
  const toggleCopying = () => {
    const next = !copying
    setCopying(next)
    if (next) setEditing(false)
    setStatus(next ? 'Copy mode on' : '')
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

      const next = pasteRange(sheet, range, at)
      setGrid(next.grid)
      setTies(next.ties)
      setMarks(next.marks)
      const length = range.to - range.from + 1
      setStatus(`Pasted ${length} position${length === 1 ? '' : 's'}`)
      return 'pasted'
    },
    [sheet, grid, rows],
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

  /** Sound a whole position at once — the chord live mode's playhead reaches. */
  const playColumn = useCallback(
    (col) => {
      grid[col]?.forEach((value, stringIndex) => playNote(stringIndex, value))
    },
    [grid, playNote],
  )

  /** Ask for a tempo, starting from whatever the sheet was last played at. */
  const openLive = (event) => {
    if (liveMenu) {
      setLiveMenu(null)
      return
    }
    setBpmDraft(String(bpm))
    setLiveMenu(event.currentTarget)
  }

  const closeLive = useCallback(() => setLive(false), [])

  const startLive = () => {
    // Fullscreen permission belongs to the click that starts playback. Asking
    // from LiveMode's effect is too late for browsers that consume activation
    // once this handler returns. The overlay covers the document while live,
    // so making the document element fullscreen has the intended result.
    document.documentElement.requestFullscreen?.().catch(() => {})
    setBpm(clampBpm(bpmDraft))
    setLiveMenu(null)
    setLive(true)
  }

  /**
   * Fill the selected position with the last one written before it — the same
   * chord played again, taken from where it stands rather than typed out a
   * second time. It sounds as it lands, like any other note pressed.
   */
  const handleCopyColumn = useCallback(
    (col) => {
      const source = previousWrittenColumn(grid, col)
      if (source < 0) return

      const next = copyColumn(sheet, source, col)
      setGrid(next.grid)
      setTies(next.ties)
      setMarks(next.marks)
      // The source still holds what the target is about to, so this is the
      // chord that has just been written, played from where it was copied.
      playColumn(source)
    },
    [grid, sheet, playColumn],
  )

  const handleCellChange = useCallback((col, stringIndex, value) => {
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
   * Send a written note to another string without changing its pitch — the
   * correction for one written on the wrong string. Its symbol
   * travels with it. An arc cannot: both ends of one live on the same string,
   * so an arc ending on the note goes the way it would if the note had been
   * erased, which is what clearing the old position does.
   */
  const handleNudgeNote = useCallback(
    (col, fromString, toString, fret) => {
      const symbol = markAt(marks, fromString, col)
      handleCellChange(col, fromString, '')
      handleCellChange(col, toString, String(fret))
      if (symbol) setMarks((prev) => toggleMark(prev, toString, col, symbol))
    },
    [marks, handleCellChange],
  )

  const handleToggleMark = useCallback((col, stringIndex, symbol) => {
    setMarks((prev) => toggleMark(prev, stringIndex, col, symbol))
  }, [])

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
      setTies((prev) => prev.filter((existingTie) => !isSameTie(existingTie, tie)))
      return
    }

    if (!existing) handleCellChange(targetCol, stringIndex, value)
    // A note carries one arc back and one on, so a new arc replaces only what
    // hung off the same side — the other side is left as it was, which is how
    // a note comes to be held right through a run of positions.
    setTies((prev) => [...prev.filter((existingTie) => !tiesClash(existingTie, tie)), tie])
  }

  const fileStem = slugify(title)

  const exportText = () => {
    downloadFile(`${fileStem}.txt`, asciiTab, 'text/plain')
    setStatus('Saved text tab')
  }

  const exportJson = () => {
    downloadFile(
      `${fileStem}.json`,
      toJson({ ...sheet, bpm }, STANDARD_TUNING, title),
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
    setTitle(parsed.title)
    setRows(parsed.rows)
    setGroups(parsed.groups)
    setGrid(fitGrid(parsed.grid, parsed.rows))
    setTies(parsed.ties)
    setMarks(parsed.marks)
    setStructure(parsed.structure)
    setBpm(parsed.bpm)
    setPendingRemove(null)
    setConfirmingRemoveRow(false)
    setStatus(`Opened ${file.name}`)
  }

  const clearAll = () => {
    const fresh = createRows()
    setRows(fresh)
    setGroups(createGroups(fresh.length))
    setGrid(createGrid(totalColumns(fresh)))
    setTies([])
    setMarks([])
    setStructure([])
    setPendingRemove(null)
    setConfirmingRemoveRow(false)
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
            aria-label={editing ? 'Finish editing the order' : 'Edit the order'}
            onClick={toggleEditing}
            title={
              editing
                ? 'Editing the order — press two rows or two groups to swap them'
                : 'Reorder the rows and the running order'
            }
          >
            <SwapIcon />
          </button>
          <button
            type="button"
            className={`icon-button${copying ? ' is-on' : ''}`}
            aria-pressed={copying}
            aria-label={copying ? 'Finish copying' : 'Copy and paste notes'}
            onClick={toggleCopying}
            disabled={editing}
            title={
              copying
                ? 'Copy mode — press two positions to pick a stretch out, then a paste button'
                : 'Copy a stretch of notes and paste it elsewhere'
            }
          >
            <CopyIcon />
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
          <button
            type="button"
            className="icon-button"
            onClick={openLive}
            disabled={empty}
            aria-haspopup="dialog"
            aria-expanded={!!liveMenu}
            aria-label="Play the song full screen"
            title="Play the song full screen at a tempo"
          >
            <PresentIcon />
          </button>
        </div>

        <span className="status" role="status">
          {status}
        </span>
      </div>

      {/* The status line beside the buttons clears itself after a few seconds,
          which is right for something that has just happened and wrong for a
          mode that is still on. So the mode says what it is here instead. */}
      {editing && (
        <p className="edit-hint">
          Press a row or a group, then press another, and the two exchange places.
          Writing is off until this is turned back off.
        </p>
      )}

      {copying && (
        <p className="edit-hint">
          Press two circles on one row to pick out a stretch, then a paste button to
          write it down starting there. A stretch cannot span two rows.
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

      {liveMenu && (
        <Popover
          anchor={liveMenu}
          className="live-menu"
          label="Live playback"
          onClose={() => setLiveMenu(null)}
        >
          <label className="live-menu-label" htmlFor="live-bpm">
            Tempo
          </label>
          <div className="live-menu-row">
            <input
              id="live-bpm"
              className="live-menu-input"
              type="number"
              inputMode="numeric"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpmDraft}
              autoFocus
              onChange={(event) => setBpmDraft(event.target.value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') startLive()
              }}
            />
            <span className="live-menu-unit">BPM</span>
          </div>
          <label className="live-menu-toggle">
            <input
              type="checkbox"
              checked={simpleLiveMode}
              onChange={(event) => setSimpleLiveMode(event.target.checked)}
            />
            <span>Simple mode</span>
          </label>
          <button type="button" className="live-menu-start" onClick={startLive}>
            Start
          </button>
          <p className="live-menu-hint">
            One position is one beat, so a bar is four. The song plays in the order the
            Groups strip sets.
          </p>
        </Popover>
      )}

      <main className="sheet">
        <TabEditor
          grid={grid}
          rows={rows}
          groups={groups}
          tuning={STANDARD_TUNING}
          ties={ties}
          marks={marks}
          structure={structure}
          editing={editing}
          onSetGroup={handleSetGroup}
          onSetGroupRepeat={handleSetGroupRepeat}
          onSwapRows={handleSwapRows}
          onSwapGroupSlots={handleSwapGroupSlots}
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
          copying={copying}
          onPasteRange={handlePasteRange}
          pendingRemove={pendingRemove}
          onCancelRemove={() => setPendingRemove(null)}
        />
      </main>

      <div className="sheet-actions">
        <button type="button" onClick={handleAddRow} disabled={editing}>
          + New row
        </button>
        <button
          type="button"
          className={confirmingRemoveRow ? 'danger' : ''}
          onClick={handleRemoveRow}
          onBlur={() => setConfirmingRemoveRow(false)}
          disabled={editing || rows.length <= 1}
        >
          {confirmingRemoveRow
            ? `Delete ${lastRowNotes} note${lastRowNotes === 1 ? '' : 's'} in group ${rowLabel(rows.length - 1)}?`
            : '− Remove row'}
        </button>
      </div>

      <section className="output">
        <button type="button" className="link" onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide' : 'Show'} text output
        </button>
        {showText && <pre className="output-pre">{empty ? '(nothing written yet)' : asciiTab}</pre>}
      </section>

      {live && (
        <LiveMode
          sheet={sheet}
          tuning={STANDARD_TUNING}
          title={title}
          bpm={bpm}
          simpleMode={simpleLiveMode}
          onBpmChange={setBpm}
          onPlayColumn={playColumn}
          onClose={closeLive}
        />
      )}
    </div>
  )
}
