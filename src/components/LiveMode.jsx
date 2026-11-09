import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import StaffOverlay from './StaffOverlay.jsx'
import { CELL_W, ROW_H, groupTone } from '../utils/layout.js'
import { STRING_COUNT } from '../utils/cell.js'
import {
  BEATS_PER_BAR,
  LEAD_IN_BEATS,
  MAX_BPM,
  MIN_BPM,
  barOf,
  clampBpm,
  columnAt,
  runAt,
  secondsPerBeat,
  songBeats,
  songRuns,
} from '../utils/live.js'

/** What the tempo buttons and the up/down arrows change the tempo by. */
const BPM_STEP = 5

/**
 * How the staff is sized to the window it is played in.
 *
 * The six strings plus the room the labels take above them is the height one
 * staff needs unscaled; the zoom is whatever fits that into the space left
 * over by the toolbar — a phone, or a browser with its own bars, leaves far
 * less than a desktop, and guessing from the window's width alone cut the top
 * string off. The width has a say too: blown up far enough, the beats ahead of
 * the playhead stop fitting on the screen, and a player cannot read what is
 * coming.
 */
const STAFF_HEIGHT = STRING_COUNT * ROW_H + 40
/** Beats that must stay on screen, which is what caps the zoom on a phone. */
const VISIBLE_BEATS = 10
const MIN_SCALE = 0.7
const MAX_SCALE = 2

/** The zoom a staff can be drawn at in a window this size. */
const fitScale = (width, height) =>
  Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, height / STAFF_HEIGHT, width / (VISIBLE_BEATS * CELL_W)),
  )

/**
 * One stretch of the song, drawn as a staff line: the positions it sounds as
 * plain text, with the same arcs and symbols the editor draws over them.
 *
 * A stretch names the row it sounds and where in that row it begins, so a
 * passage played three times is drawn three times from the one row, and its
 * arcs and symbols come with it each time without any of them being copied.
 *
 * What it is called is written over the first stretch of each row; a group
 * played more than once says which time round it is instead, since that is
 * the thing worth knowing when the same bars come past again.
 */
const LiveRun = memo(function LiveRun({ run, row, ties, marks, simpleMode }) {
  return (
    <div
      className={`live-run${run.opens ? ' live-run--opens' : ''}`}
      style={{ width: run.cols * CELL_W, '--group': groupTone(run.section) }}
    >
      {/* Which time round it is, where that is more than one: the same bars
          coming past again are worth telling apart. */}
      {!simpleMode && run.passes > 1 && (
        <span className="live-block-label">{`${run.pass} of ${run.passes}`}</span>
      )}
      {/* A row that has been named is called by its name here — that is what
          the player wrote it down for — and one that has not is called by its
          number, the way the row itself is. */}
      {!simpleMode && run.opens && (
        <span className="live-run-label">{run.label || `Row ${run.row + 1}`}</span>
      )}
      <StaffOverlay
        ties={ties}
        marks={marks}
        staffStart={run.from}
        cols={run.cols}
        preview={null}
      />
      {Array.from({ length: STRING_COUNT }, (_, stringIndex) => (
        <div className="string-row" key={stringIndex}>
          {Array.from({ length: run.cols }, (_, offset) => {
            const value = row?.column(run.from + offset)?.cell(stringIndex)?.value ?? ''
            return (
              <span className={`live-cell${value ? ' cell--filled' : ''}`} key={offset}>
                {value}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
})

/**
 * The whole song end to end, laid out at one cell per beat. Memoised so that
 * nothing in here is touched again once playback starts — only the transform
 * on its parent and the little box marking the beat being played change from
 * frame to frame.
 */
const LiveStrip = memo(function LiveStrip({ runs, rows, ties, marks, simpleMode }) {
  return (
    <div className="live-strip">
      {runs.map((run) => (
        // Keyed by the beat it starts on, which is the one thing no two
        // stretches share: a passage played three times is three stretches
        // over the same positions of the same row.
        <LiveRun
          key={run.beat}
          run={run}
          row={rows[run.row]}
          ties={ties.filter((tie) => tie.row === run.row)}
          marks={marks.filter((mark) => mark.row === run.row)}
          simpleMode={simpleMode}
        />
      ))}
    </div>
  )
})

/**
 * Live mode: the song played back full-screen against a fixed playhead, with
 * the tab sliding left underneath it at the chosen tempo.
 *
 * What is played is the sheet, read top to bottom: every row in turn, with
 * each group in a row coming past as many times as its count says and every
 * column standing in for a group played elsewhere bringing that group's bars
 * here. `songRuns` does that expansion, and everything here walks the flat
 * list it returns.
 *
 * Position is held in beats — fractional, so it is also the x offset of the
 * strip in cell widths — and lives in a ref rather than in state: it changes
 * every frame, and re-rendering the staff 60 times a second to move it would
 * be wasteful when a transform on one element does the same job. Only the
 * whole beat is state, since that is all the readout and the highlight need.
 */
export default function LiveMode({
  sheet,
  tuning,
  title,
  bpm,
  simpleMode,
  onBpmChange,
  onPlayColumn,
  onClose,
}) {
  const { rows, ties, marks } = sheet
  const runs = useMemo(() => songRuns(rows), [rows])
  const total = useMemo(() => songBeats(runs), [runs])
  // How many rows of the sheet have anything to play, for the readout to
  // count in: a stretch says which row of the sheet it belongs to, which is
  // not always the row it sounds.
  const sections = useMemo(() => new Set(runs.map((run) => run.section)).size, [runs])

  const [playing, setPlaying] = useState(true)
  const [beat, setBeat] = useState(-LEAD_IN_BEATS)
  // Bumped by a seek so the animation restarts from where it was moved to.
  const [seekNonce, setSeekNonce] = useState(0)

  const rootRef = useRef(null)
  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  // The zoom, measured from the space the staff actually has rather than set
  // by a media query, so nothing is ever cut off the top or bottom.
  const [scale, setScale] = useState(MAX_SCALE)
  const posRef = useRef(-LEAD_IN_BEATS)
  const beatRef = useRef(-LEAD_IN_BEATS)

  /** Put the playhead at a fractional beat: move the tab and light the column. */
  const place = useCallback((at) => {
    posRef.current = at
    if (trackRef.current) {
      // The playhead crosses a note when it reaches the middle of its cell.
      trackRef.current.style.transform = `translateX(${-(at + 0.5) * CELL_W}px)`
    }
    const whole = Math.floor(at)
    if (whole !== beatRef.current) {
      beatRef.current = whole
      setBeat(whole)
    }
  }, [])

  /** Sound everything written on the column a beat lands on. */
  const sound = useCallback(
    (at) => {
      const position = columnAt(runs, at)
      if (position) onPlayColumn(position.row, position.col)
    },
    [runs, onPlayColumn],
  )

  const seek = useCallback(
    (to) => {
      place(Math.min(total, Math.max(-LEAD_IN_BEATS, to)))
      setSeekNonce((n) => n + 1)
    },
    [place, total],
  )

  const togglePlay = useCallback(() => {
    // Pressing play at the end starts the song again rather than doing nothing.
    if (!playing && posRef.current >= total) seek(-LEAD_IN_BEATS)
    setPlaying((on) => !on)
  }, [playing, total, seek])

  // Re-measured as the window changes: rotating a phone, or the browser's own
  // bars sliding away, both change what there is to fit into.
  useLayoutEffect(() => {
    const box = viewportRef.current
    if (!box) return undefined

    const fit = () => setScale(fitScale(box.clientWidth, box.clientHeight))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The strip has to be under the playhead before the first paint, or the song
  // shows from its first beat for a frame before jumping back to the lead-in.
  useLayoutEffect(() => {
    place(posRef.current)
    rootRef.current?.focus()
  }, [place])

  /**
   * The clock. Restarted whenever the tempo changes, playback is paused or
   * resumed, or the position is moved — each of those rebases on wherever the
   * playhead currently is, so a tempo change mid-song is seamless.
   */
  useEffect(() => {
    if (!playing) return undefined

    const msPerBeat = secondsPerBeat(bpm) * 1000
    const from = posRef.current
    const startedAt = performance.now()
    let frame = 0

    const tick = (now) => {
      const was = Math.floor(posRef.current)
      const at = Math.min(total, from + (now - startedAt) / msPerBeat)
      place(at)
      // A frame can arrive late enough to cross more than one beat. Sound each
      // crossed column rather than only the final one, so a stall loses neither
      // chords nor their place in the song.
      for (let crossed = Math.max(0, was + 1); crossed < total && crossed <= Math.floor(at); crossed += 1) {
        sound(crossed)
      }
      if (at >= total) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, bpm, total, seekNonce, place, sound])

  /**
   * App asks for full screen directly from the Start click. Leaving that mode
   * any other way — esc, or the browser's own control — also closes this
   * overlay. A rejected request still leaves the overlay covering the window.
   */
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onClose()
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      // Only undo the full screen session this player opened, not one another
      // part of the page happened to own.
      if (document.fullscreenElement === document.documentElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [onClose])

  const handleKeyDown = (event) => {
    const { key } = event
    if (key === ' ') {
      // Swallowed so it cannot also press whichever transport button has focus.
      event.preventDefault()
      togglePlay()
    } else if (key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault()
      // Seeking lands on the bar line, so a repeated press walks bar to bar.
      const bar = Math.floor(posRef.current / BEATS_PER_BAR)
      seek((key === 'ArrowRight' ? bar + 1 : bar) * BEATS_PER_BAR)
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault()
      onBpmChange(clampBpm(bpm + (key === 'ArrowUp' ? BPM_STEP : -BPM_STEP)))
    } else if (key === 'Home') {
      event.preventDefault()
      seek(-LEAD_IN_BEATS)
    }
  }

  const run = runAt(runs, beat)
  // The sheet is what is being played, so the readout counts in it: what this
  // stretch is called, which row of the sheet it belongs to, which time round
  // it is where that is more than one, and the bar reached inside it.
  const readout = run
    ? [
        run.label || `Row ${run.row + 1}`,
        `${run.section + 1} of ${sections}`,
        ...(run.passes > 1 ? [`play ${run.pass} of ${run.passes}`] : []),
        `bar ${barOf(run, beat)}`,
      ].join(' · ')
    : beat < 0
      ? 'Ready'
      : 'End of song'
  // The lead-in is part of the journey, so it is part of the progress too.
  const progress = (beat + LEAD_IN_BEATS) / (total + LEAD_IN_BEATS)

  return (
    <div
      className={`live${simpleMode ? ' live--simple' : ''}`}
      ref={rootRef}
      style={{ '--live-scale': scale }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Live playback"
      onKeyDown={handleKeyDown}
    >
      <header className="live-bar">
        {!simpleMode && <span className="live-title">{title || 'Untitled'}</span>}

        {!simpleMode && (
          <div className="live-transport">
            <button type="button" onClick={() => seek(-LEAD_IN_BEATS)} title="Back to the start">
              ⏮
            </button>
            <button type="button" className="live-play" onClick={togglePlay}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <div className="live-tempo">
              <button
                type="button"
                onClick={() => onBpmChange(clampBpm(bpm - BPM_STEP))}
                disabled={bpm <= MIN_BPM}
                aria-label="Slower"
              >
                −
              </button>
              <span className="live-bpm">{bpm} BPM</span>
              <button
                type="button"
                onClick={() => onBpmChange(clampBpm(bpm + BPM_STEP))}
                disabled={bpm >= MAX_BPM}
                aria-label="Faster"
              >
                +
              </button>
            </div>
          </div>
        )}

        {!simpleMode && (
          <span className="live-readout" role="status">
            {readout}
          </span>
        )}
        <button type="button" onClick={onClose}>
          Exit
        </button>
      </header>

      <div className="live-viewport" ref={viewportRef}>
        <div className="live-stage">
          <div className="live-track" ref={trackRef}>
            <LiveStrip
              runs={runs}
              rows={rows}
              ties={ties}
              marks={marks}
              simpleMode={simpleMode}
            />
            {beat >= 0 && beat < total && (
              // The beat now sounding, which is the ground the playhead covers
              // between this note and the next — so it stays under the line.
              <div className="live-now" style={{ left: (beat + 0.5) * CELL_W, width: CELL_W }} />
            )}
          </div>
        </div>

        {/* Pinned over the left edge, so which string is which never scrolls away. */}
        {!simpleMode && (
          <div className="live-labels" aria-hidden="true">
            {tuning.map((label, stringIndex) => (
              <span className="string-label" key={stringIndex}>
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="live-playhead" aria-hidden="true" />
      </div>

      {!simpleMode && (
        <div className="live-progress" aria-hidden="true">
          <div className="live-progress-fill" style={{ width: `${Math.max(0, progress) * 100}%` }} />
        </div>
      )}

    </div>
  )
}
