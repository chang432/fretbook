import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveMode from './components/LiveMode.jsx'
import MemoSection from './components/MemoSection.jsx'
import NoteIndex from './components/NoteIndex.jsx'
import Popover from './components/Popover.jsx'
import PublishMenu from './components/PublishMenu.jsx'
import TabEditorV2 from './components/TabEditorV2.jsx'
import { PencilIcon, PresentIcon, SoundIcon, UndoIcon } from './components/icons.jsx'
import {
  MARK_ZIGZAG,
  createSheet,
  fromJson,
  isEmpty,
  removeGroup,
  toJson,
} from './utils/sheet.js'
import {
  Row,
  STANDARD_TUNING,
  copyPreviousPosition,
  deleteColumn,
  deleteRef,
  endGroup,
  insertColumn,
  nameGroup,
  placeGroup,
  previousWrittenPosition,
  resizeRow,
  setRepeat,
  startGroup,
  writeCell,
} from './utils/tabV2.js'
import { downloadFile, slugify } from './utils/files.js'
import { HISTORY_LIMIT, nextUndoLabel, popHistory, pushHistory } from './utils/history.js'
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, clampBpm, hasSong } from './utils/live.js'
import { deleteNote, publishNote, updateNote } from './utils/notes.js'
import { cellFrequency, createAudioEngine } from './utils/audio.js'

// The one slot this browser keeps its sheet in. The suffix namespaces the
// *slot* — one key holding one JSON export — and not the sheet format inside
// it: `fromJson` refuses anything but the current version, so a changed
// format needs no new key.
const STORAGE_KEY = 'fretboard-notebook:v1'

// A JSON file is parsed in memory before its contents can be validated. This
// keeps a malformed or accidental multi-gigabyte selection from freezing the
// page before `fromJson` can apply its structural limits.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

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
 *
 * A sheet is its rows, top to bottom. There is no arrangement and no grouping
 * of rows: what says a passage is played more than once is a group marked
 * inside a staff, which the player reads straight off the row — see
 * utils/live.js.
 */
export default function App({ published = null, fresh = false, onOpenSheet, onNewSheet }) {
  // Read the note, or localStorage, once and lazily, and seed the state below
  // from whichever it was. Nothing published and nothing saved means a blank
  // page, which is a sheet of its own rather than an absence.
  const [unreadableSave] = useState(() => {
    if (published) return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return !!raw && !fromJson(raw)
    } catch {
      return false
    }
  })
  const [saved] = useState(() => published?.sheet ?? (fresh ? createSheet() : loadSaved() ?? createSheet()))
  const [title, setTitle] = useState(saved.title ?? '')
  // The note written above the staves: prose about the sheet — a tuning, a
  // capo, what to listen for. Called a memo here because "note" already means
  // a fret on a string, and a published sheet besides.
  const [memo, setMemo] = useState(saved.memo ?? '')
  // The music: a Row per staff, each holding its own run of positions.
  const [rows, setRows] = useState(saved.rows)
  // Arcs joining two positions of a string, and the symbols over notes.
  const [ties, setTies] = useState(saved.ties)
  const [marks, setMarks] = useState(saved.marks)
  const [status, setStatus] = useState('')
  const [editingRows, setEditingRows] = useState(false)
  // The open write panel, as the button it hangs under and which of the three
  // presses it is — they are one panel asking for different things.
  const [writeMenu, setWriteMenu] = useState(null)
  const [sheetPicker, setSheetPicker] = useState(null)
  // Set once this page's note has been taken down, which leaves the sheet on
  // screen with nothing behind it: there is no note left to update or delete.
  const [deleted, setDeleted] = useState(false)
  const [audioOn, setAudioOn] = useState(false)
  // The player. None of it is saved with the sheet: a tempo and an
  // audience-facing display are how a song is being played right now rather
  // than anything the song itself says, so both are asked for per launch.
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [liveMenu, setLiveMenu] = useState(null)
  const [bpmDraft, setBpmDraft] = useState('')
  const [simpleLiveMode, setSimpleLiveMode] = useState(false)
  const [live, setLive] = useState(false)
  const fileInputRef = useRef(null)
  // Deliberately not restored from a saved session: a page should not be able
  // to start making noise before the reader has asked for it.
  const audioRef = useRef(null)

  const sheet = useMemo(() => ({ rows, ties, marks }), [rows, ties, marks])
  // The sheet as the bucket would hold it. One memo serves both the writes
  // below and the test of whether a published note has been changed at all.
  const json = useMemo(
    () => toJson({ ...sheet, memo }, STANDARD_TUNING, title),
    [sheet, memo, title],
  )
  const empty = useMemo(() => isEmpty(rows), [rows])
  // Whether there is a song to play at all, which on an empty sheet there is
  // not: the player's own model is asked rather than the staves counted.
  const playable = useMemo(() => hasSong(rows) && !empty, [rows, empty])
  // The published note as this page opened it, taken once and through the
  // same `toJson` an upload goes through, so the two compare byte for byte.
  const [openedAs] = useState(() =>
    published ? toJson({ ...saved, memo: saved.memo ?? '' }, STANDARD_TUNING, saved.title ?? '') : null,
  )
  const [sentAs, setSentAs] = useState(null)
  const changed = openedAs !== null && json !== (sentAs ?? openedAs)

  // The sheet as it stood before each of the last few actions, oldest first.
  const [history, setHistory] = useState([])

  // The sheet as it stands now, for `remember` to take its snapshot from,
  // read through a ref so the memoised handlers need not be rebuilt when it
  // changes.
  const sheetRef = useRef(sheet)
  const pendingGroup = useRef(null)
  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])

  /**
   * Take down how the editor stands, for the Undo button to put back. A
   * handler calls this on the path where it is about to change something, so
   * a press that changed nothing does not cost a step of history.
   *
   * `label` finishes the sentence "Undid …". `token` names the cell for the
   * edits that arrive a keystroke at a time; see pushHistory. `extra` carries
   * the fields outside the sheet that an action also rewrites.
   */
  const remember = useCallback((label, { token = null, extra = null } = {}) => {
    setHistory((prev) =>
      pushHistory(prev, { label, token, state: { ...sheetRef.current, ...extra } }),
    )
  }, [])

  /** Put a new sheet in place, leaving whatever the snapshot does not name. */
  const applySheet = useCallback((next) => {
    if (next.rows) setRows(next.rows)
    if (next.ties) setTies(next.ties)
    if (next.marks) setMarks(next.marks)
    if (next.title !== undefined) setTitle(next.title)
    if (next.memo !== undefined) setMemo(next.memo)
  }, [])

  /**
   * Step back one action. Every snapshot is the sheet as it stood before the
   * action that took it, so applying the newest and dropping it walks back
   * through the stack a press at a time.
   */
  const handleUndo = () => {
    const { stack, entry } = popHistory(history)
    if (!entry) return

    setHistory(stack)
    applySheet(entry.state)
    setStatus(`Undid ${entry.label}`)
  }

  /* Writing in the staves ------------------------------------------------ */

  /**
   * Write one cell. A run of these in the same cell is one step back rather
   * than one per keystroke — which is what the cell's token is for. Erasing a
   * note takes any arc or symbol anchored to it with it.
   */
  const handleCellChange = useCallback(
    (row, col, string, value) => {
      const standing = sheetRef.current.rows
      const written = writeCell(standing, row, col, string, value)
      if (written === standing) return

      remember(value === '' ? 'erasing a note' : 'writing a note', {
        token: `cell:${row}:${col}:${string}`,
      })
      setRows(written)

      if (written[row].column(col).cell(string).isEmpty) {
        setTies((prev) =>
          prev.filter(
            (tie) =>
              tie.row !== row || tie.string !== string || (tie.from !== col && tie.to !== col),
          ),
        )
        setMarks((prev) =>
          prev.filter((mark) => !(mark.row === row && mark.col === col && mark.string === string)),
        )
      }
    },
    [remember],
  )

  /**
   * Fill a position with the last one written before it — the same chord
   * played again, taken from where it stands rather than typed out a second
   * time. Its symbols come with it.
   */
  const handleCopyPrevious = useCallback(
    (row, col) => {
      const standing = sheetRef.current.rows
      const source = previousWrittenPosition(standing, row, col)
      if (!source) return

      remember('copying a chord')
      setRows(copyPreviousPosition(standing, row, col))
      setMarks((prev) => [
        ...prev.filter((mark) => !(mark.row === row && mark.col === col)),
        ...prev
          .filter((mark) => mark.row === source.row && mark.col === source.col)
          .map((mark) => ({ ...mark, row, col })),
      ])
    },
    [remember],
  )

  /**
   * Hold a note through to another position. An empty destination takes the
   * source's fret; one that already holds a note keeps its own and is simply
   * joined to the source. Tying the same pair again removes the arc.
   */
  const handleTie = useCallback(
    (row, string, source, target) => {
      const from = Math.min(source, target)
      const to = Math.max(source, target)
      const standing = sheetRef.current
      const already = standing.ties.some(
        (tie) => tie.row === row && tie.string === string && tie.from === from && tie.to === to,
      )

      remember(already ? 'removing an arc' : 'adding an arc')

      if (already) {
        setTies((prev) =>
          prev.filter(
            (tie) =>
              !(tie.row === row && tie.string === string && tie.from === from && tie.to === to),
          ),
        )
        return
      }

      if (standing.rows[row].column(target).cell(string).isEmpty) {
        setRows((prev) =>
          writeCell(prev, row, target, string, standing.rows[row].column(source).cell(string).value),
        )
      }
      // A note carries one arc back and one on, so a new arc replaces only
      // what hung off the same side.
      setTies((prev) => [
        ...prev.filter(
          (tie) =>
            tie.row !== row ||
            tie.string !== string ||
            (tie.from !== from && tie.to !== to && tie.from !== to && tie.to !== from),
        ),
        { row, string, from, to },
      ])
    },
    [remember],
  )

  const handleToggleMark = useCallback(
    (row, col, string) => {
      const standing = sheetRef.current.marks.some(
        (mark) => mark.row === row && mark.col === col && mark.string === string,
      )
      remember(standing ? 'removing a symbol' : 'adding a symbol')
      setMarks((prev) =>
        standing
          ? prev.filter((mark) => !(mark.row === row && mark.col === col && mark.string === string))
          : [...prev, { row, col, string, symbol: MARK_ZIGZAG }],
      )
    },
    [remember],
  )

  /* Rows and their shape ------------------------------------------------- */

  /**
   * An edit that renumbers a row's positions. Everything held against a
   * position — the arcs and symbols of that row — no longer says where it
   * was, so it goes.
   */
  const reshape = useCallback(
    (label, row, next) => {
      const standing = sheetRef.current.rows
      const shaped = next(standing)
      if (shaped === standing) return false

      remember(label)
      setRows(shaped)
      setTies((prev) => prev.filter((tie) => tie.row !== row))
      setMarks((prev) => prev.filter((mark) => mark.row !== row))
      return true
    },
    [remember],
  )

  const handleRowNameChange = (row, name) => {
    name = name.toLowerCase()
    if (rows[row].name === name) return
    remember(`naming row ${row + 1}`, { token: `name:${row}` })
    setRows((prev) =>
      prev.map((item, at) => (at === row ? new Row(item.length, item.columns, name) : item)),
    )
  }

  /** Add an empty row to the end of the sheet. */
  const handleAddRow = () => {
    remember('adding a row')
    setRows((prev) => [...prev, new Row()])
    setStatus(`Row ${rows.length + 1} added`)
  }

  /**
   * Take one row off the sheet. It goes on the press that asks for it: Undo
   * is the way back. Everything held against that row's positions goes with
   * it, and what was held against the rows below moves up with them.
   */
  const handleDeleteRow = (row) => {
    if (rows.length <= 1) return

    remember(`deleting row ${row + 1}`)
    setRows((prev) => prev.filter((_, at) => at !== row))
    const shift = (held) =>
      held.filter((item) => item.row !== row).map((item) => (item.row > row ? { ...item, row: item.row - 1 } : item))
    setTies(shift)
    setMarks(shift)
    setStatus(`Deleted row ${row + 1}`)
  }

  const handleReorderRows = (order) => {
    if (order.every((old, index) => old === index)) return
    remember('moving a row')
    const positions = new Map(order.map((old, index) => [old, index]))
    setRows((prev) => order.map((index) => prev[index]))
    setTies((prev) => prev.map((tie) => ({ ...tie, row: positions.get(tie.row) })))
    setMarks((prev) => prev.map((mark) => ({ ...mark, row: positions.get(mark.row) })))
  }

  const handleResizeRow = useCallback(
    (row, by) => {
      const standing = sheetRef.current.rows
      const sized = resizeRow(standing, row, by)
      if (sized === standing) return

      remember(by > 0 ? `lengthening row ${row + 1}` : `shortening row ${row + 1}`)
      setRows(sized)
      // Only the end of the row moved, so what is held before it still says
      // where it is; what stood past the new end does not.
      const within = (item) => item.row !== row || item.col < sized[row].length
      setTies((prev) => prev.filter((tie) => tie.row !== row || tie.to < sized[row].length))
      setMarks((prev) => prev.filter(within))
    },
    [remember],
  )

  const handleInsertColumn = useCallback(
    (row, at) => reshape('making room', row, (prev) => insertColumn(prev, row, at)),
    [reshape],
  )

  const handlePasteRange = (sourceRow, start, end, targetRow, at) => {
    const standing = sheetRef.current.rows
    const source = standing[sourceRow]
    const target = standing[targetRow]
    if (!source || !target || start < 0 || end < start || end >= source.length || at < 0) return
    const copied = source.columns.slice(start, end + 1)
    if (copied.some((column) => column.isGroupMark)) return
    const count = copied.length
    if (at + count > target.length || target.columns.slice(at, at + count).some((column) => column.isGroupMark)) return
    const columns = [...target.columns.slice(0, at), ...copied, ...target.columns.slice(at + count)]
      .map((column, index) => column.at(index))
    remember('pasting a section')
    setRows(standing.map((row, index) => index === targetRow ? new Row(columns.length, columns, row.name) : row))
    setMarks((prev) => [
      ...prev.filter((mark) => mark.row !== targetRow || mark.col < at || mark.col >= at + count),
      ...prev.filter((mark) => mark.row === sourceRow && mark.col >= start && mark.col <= end)
        .map((mark) => ({ ...mark, row: targetRow, col: at + mark.col - start })),
    ])
    setTies((prev) => [
      ...prev.filter((tie) => tie.row !== targetRow || ((tie.from < at || tie.from >= at + count) && (tie.to < at || tie.to >= at + count))),
      ...prev.filter((tie) => tie.row === sourceRow && tie.from >= start && tie.to <= end)
        .map((tie) => ({ ...tie, row: targetRow, from: at + tie.from - start, to: at + tie.to - start })),
    ])
  }

  const handleDeleteColumn = useCallback(
    (row, col) => reshape('deleting a position', row, (prev) => deleteColumn(prev, row, col)),
    [reshape],
  )

  /* Groups ---------------------------------------------------------------- */

  const handleRepeatChange = useCallback(
    (row, col, repeat) => {
      remember('changing a count')
      setRows((prev) => setRepeat(prev, row, col, repeat))
    },
    [remember],
  )

  const handleNameChange = useCallback(
    (row, col, name) => {
      remember('naming a group')
      setRows((prev) => nameGroup(prev, row, col, name))
    },
    [remember],
  )

  const handlePlaceGroup = useCallback(
    (row, col, name) => {
      if (reshape(`playing ${name} here`, row, (prev) => placeGroup(prev, row, col, name))) {
        setStatus(`Group ${name} is played at row ${row + 1}, position ${col + 1}`)
      }
    },
    [reshape],
  )

  const handleStartGroup = useCallback((row, col) => {
    const before = sheetRef.current
    if (!before.rows[row] || before.rows[row].groupAt(col)) return null
    const extra = col === 0 ? 1 : 0
    const spaced = extra ? insertColumn(before.rows, row, col) : before.rows
    const start = col + extra
    const opened = startGroup(spaced, row, start)
    if (opened === spaced) return null
    pendingGroup.current = { row, start, before }
    setRows(opened)
    const shift = 1 + extra
    setTies((prev) => prev.map((tie) => tie.row === row ? { ...tie, from: tie.from >= col ? tie.from + shift : tie.from, to: tie.to >= col ? tie.to + shift : tie.to } : tie))
    setMarks((prev) => prev.map((mark) => mark.row === row && mark.col >= col ? { ...mark, col: mark.col + shift } : mark))
    return start
  }, [])

  const handleEndGroup = useCallback((row, start, col) => {
    const pending = pendingGroup.current
    if (!pending || pending.row !== row || pending.start !== start) return
    const standing = sheetRef.current.rows
    const closed = endGroup(standing, row, start, col)
    if (closed === standing) return
    setHistory((prev) => pushHistory(prev, { label: 'writing a group', token: null, state: pending.before }))
    pendingGroup.current = null
    setRows(closed)
    const at = col + 1
    setTies((prev) => prev.map((tie) => tie.row === row ? { ...tie, from: tie.from >= at ? tie.from + 1 : tie.from, to: tie.to >= at ? tie.to + 1 : tie.to } : tie))
    setMarks((prev) => prev.map((mark) => mark.row === row && mark.col >= at ? { ...mark, col: mark.col + 1 } : mark))
  }, [])

  const handleCancelGroup = useCallback(() => {
    if (!pendingGroup.current) return
    applySheet(pendingGroup.current.before)
    pendingGroup.current = null
  }, [applySheet])

  const handleDeleteGroup = useCallback(
    (row, col) => {
      const standing = sheetRef.current
      const next = removeGroup(standing, row, col)
      if (next === standing) return

      remember('deleting a group')
      applySheet(next)
    },
    [remember, applySheet],
  )

  const handleDeleteRef = useCallback(
    (row, col) => reshape('taking back a group played here', row, (prev) => deleteRef(prev, row, col)),
    [reshape],
  )

  /**
   * Write the sheet's note. It arrives a keystroke at a time, so the whole
   * run counts as one step of history, and the note rides along as an extra
   * since it is not part of the sheet the staves are drawn from.
   */
  const handleMemoChange = (next) => {
    if (next === memo) return
    remember('writing the note', { token: 'memo', extra: { memo } })
    setMemo(next)
  }

  /* The page around the sheet -------------------------------------------- */

  useEffect(() => {
    // A published note is the server's, and the reader has a sheet of their
    // own that this one is only being read in front of.
    if (published || unreadableSave) return
    try {
      localStorage.setItem(STORAGE_KEY, toJson({ ...sheet, memo }, STANDARD_TUNING, title))
    } catch {
      // Private-mode / quota failures are not worth interrupting the user for.
    }
  }, [published, unreadableSave, sheet, memo, title])

  useEffect(() => {
    if (!status) return undefined
    const timer = setTimeout(() => setStatus(''), 2400)
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

  /** Sound one written note. Silent for empty positions and muted strings. */
  const playNote = useCallback(
    (string, value) => {
      if (!audioOn) return
      const frequency = cellFrequency(value, string)
      if (frequency !== null) audioRef.current?.play(frequency)
    },
    [audioOn],
  )

  /** Sound a whole position at once — every string written in one column. */
  const playColumn = useCallback(
    (row, col) => {
      rows[row]?.column(col)?.cells.forEach((cell) => playNote(cell.string, cell.value))
    },
    [rows, playNote],
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
    // Fullscreen permission belongs to the click that starts playback.
    document.documentElement.requestFullscreen?.().catch(() => {})
    setBpm(clampBpm(bpmDraft))
    setLiveMenu(null)
    setLive(true)
  }

  const fileStem = slugify(title)

  /** What the Undo button would take back, or null when it would do nothing. */
  const undoing = nextUndoLabel(history)

  const exportJson = () => {
    downloadFile(`${fileStem}.json`, json, 'application/json')
    setStatus('Saved JSON')
  }

  /** Open one of the write panels, or put it away if it is already open. */
  const openWrite = (mode, anchor) => {
    setWriteMenu((open) => (open?.mode === mode ? null : { mode, anchor }))
  }

  /** What each of the three presses does, and what it leaves behind. */
  const writes = {
    publish: { send: (slug) => publishNote(slug, json), said: 'Published' },
    update: {
      send: (slug, password) => updateNote(slug, json, password),
      said: 'Updated',
      // What was sent is what the note holds now, so it becomes the thing a
      // further change is measured against.
      then: () => setSentAs(json),
    },
    delete: {
      send: (slug, password) => deleteNote(slug, password),
      said: 'Deleted',
      then: () => setDeleted(true),
    },
  }

  /**
   * Write to this environment's bucket: a new note at /notes/<slug>, this
   * sheet over the published note the page is showing, or that note gone.
   */
  const writeSheet = async (slug, password) => {
    const write = writes[writeMenu?.mode ?? 'publish']
    const result = await write.send(slug, password)
    if (!result.ok) return result

    setStatus(`${write.said} ${slug}`)
    write.then?.()
    return result
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
      setStatus('That file is not a current Fretbook export')
      return
    }
    // Opening a file replaces the title and the note as well as the sheet.
    remember(`opening ${file.name}`, { extra: { title, memo } })
    applySheet(parsed)
    setStatus(`Opened ${file.name}`)
  }

  return (
    <div className="app">
      <header className="header">
        <h1><button type="button" className="home-button" onClick={onNewSheet} title="Start a new sheet">Fretbook</button></h1>
        <input
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value.toLowerCase().replace(/ /g, '_'))}
          autoCapitalize="off"
          placeholder="Untitled"
          aria-label="Title"
        />
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            onClick={exportJson}
            disabled={empty}
            aria-label="Export JSON"
            title="Export JSON"
          >
            Export
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Import JSON" title="Import JSON">
            Import
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={importJson} />

          <button
            type="button"
            className={`icon-button${audioOn ? ' is-on' : ''}`}
            aria-pressed={audioOn}
            aria-label={audioOn ? 'Sound on' : 'Sound off'}
            onClick={toggleAudio}
            title={audioOn ? 'Sound is on — hear each note as you press it' : 'Sound is off'}
          >
            <SoundIcon muted={!audioOn} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={openLive}
            disabled={!playable}
            aria-haspopup="dialog"
            aria-expanded={!!liveMenu}
            aria-label="Play the sheet full screen"
            title={
              playable
                ? 'Play the sheet full screen at a tempo'
                : 'Write something on a staff to play it'
            }
          >
            <PresentIcon />
          </button>
        </div>

        <span className="status" role="status">
          {status}
        </span>

        <div className="toolbar-group toolbar-group--end">
          {published ? (
            <>
              <button
                type="button"
                className={writeMenu?.mode === 'update' ? 'danger' : ''}
                onClick={(event) => openWrite('update', event.currentTarget)}
                disabled={!changed || deleted}
                aria-haspopup="dialog"
                aria-expanded={writeMenu?.mode === 'update'}
                title={
                  deleted
                    ? 'This note has been taken down'
                    : changed
                      ? `Write this sheet over ${published.slug} — needs the password`
                      : 'Nothing has been changed on this note yet'
                }
              >
                Update
              </button>
              <button
                type="button"
                className={writeMenu?.mode === 'delete' ? 'danger' : ''}
                onClick={(event) => openWrite('delete', event.currentTarget)}
                disabled={deleted}
                aria-haspopup="dialog"
                aria-expanded={writeMenu?.mode === 'delete'}
                title={
                  deleted
                    ? 'This note has been taken down'
                    : `Take ${published.slug} down for good — needs the password`
                }
              >
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(event) => openWrite('publish', event.currentTarget)}
              disabled={empty}
              aria-haspopup="dialog"
              aria-expanded={!!writeMenu}
              title="Save this sheet so it can be opened from the sheet list"
            >
              Publish
            </button>
          )}
          <button type="button" onClick={(event) => setSheetPicker(sheetPicker ? null : event.currentTarget)} aria-haspopup="dialog" aria-expanded={!!sheetPicker}>
            Sheets
          </button>
        </div>
      </div>

      <div className="toolbar-secondary">
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
          <button type="button" className={`icon-button${editingRows ? ' is-on' : ''}`} aria-label="Edit row order" title="Edit row order" aria-pressed={editingRows} onClick={() => setEditingRows((value) => !value)}>
            <PencilIcon />
          </button>
      </div>

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
            One position is one beat. The sheet plays top to bottom, and a group
            comes past as many times as its count says.
          </p>
        </Popover>
      )}

      {sheetPicker && (
        <NoteIndex anchor={sheetPicker} onClose={() => setSheetPicker(null)} onOpen={(slug) => { setSheetPicker(null); onOpenSheet(slug) }} />
      )}

      {writeMenu && (
        <PublishMenu
          anchor={writeMenu.anchor}
          mode={writeMenu.mode}
          note={published?.slug ?? null}
          defaultSlug={fileStem}
          onClose={() => setWriteMenu(null)}
          onWrite={writeSheet}
          onOpen={onOpenSheet}
        />
      )}

      <main className="sheet">
        {unreadableSave && (
          <p role="alert">
            Your saved sheet uses an unsupported format. It has been kept in browser storage;
            changes on this page will not be autosaved.
          </p>
        )}

        <MemoSection memo={memo} onChange={handleMemoChange} />

        <TabEditorV2
          editingRows={editingRows}
          onReorderRows={handleReorderRows}
          rows={rows}
          tuning={STANDARD_TUNING}
          ties={ties}
          marks={marks}
          onCellChange={handleCellChange}
          onCopyPrevious={handleCopyPrevious}
          onTie={handleTie}
          onToggleMark={handleToggleMark}
          onPlayNote={playNote}
          onRowNameChange={handleRowNameChange}
          onRepeatChange={handleRepeatChange}
          onNameChange={handleNameChange}
          onPlaceGroup={handlePlaceGroup}
          onStartGroup={handleStartGroup}
          onEndGroup={handleEndGroup}
          onCancelGroup={handleCancelGroup}
          onDeleteGroup={handleDeleteGroup}
          onDeleteRef={handleDeleteRef}
          onResizeRow={handleResizeRow}
          onInsertColumn={handleInsertColumn}
          onPasteRange={handlePasteRange}
          onDeleteColumn={handleDeleteColumn}
          onDeleteRow={handleDeleteRow}
          canDeleteRow={rows.length > 1}
        />

        {/* A new staff goes at the foot of the sheet, where the next one
            would be written. It is the only thing down here, so it is a
            button and not a bar of them. */}
        <button type="button" className="add-row" onClick={handleAddRow}>
          + New row
        </button>
      </main>

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
