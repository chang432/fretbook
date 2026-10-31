/**
 * The song as a flat run of beats, which is what live mode plays.
 *
 * One grid column is one beat, so a bar (COLS_PER_BAR columns) is one bar of
 * 4/4 — the playhead crosses a column every `secondsPerBeat`.
 *
 * What is played is the **arrangement**: the running order the sheet's groups
 * have been laid out in, read left to right. Each block in it is expanded here
 * rather than in the view, into one run per row that block's group holds — so
 * a chorus standing twice in the order is two separate stretches of the
 * timeline that both point back at the same columns of the grid. The player
 * then walks a flat list of stretches and never has to work out where a row,
 * or a block, begins.
 *
 * A sheet with nothing arranged has no song: the staves say what the music is
 * and the arrangement says what order it is played in, and there is no
 * sensible guess to make about the second from the first.
 */

import { COLS_PER_BAR, rowStarts, rowWidth, rowsInGroup } from './tab.js'

/** Beats in a bar. One column is one beat, so this is the bar width. */
export const BEATS_PER_BAR = COLS_PER_BAR

/**
 * Silent bar before the first note. Playback starts here rather than on beat
 * one, so there is a bar's worth of tempo to pick up before anything is due.
 */
export const LEAD_IN_BEATS = COLS_PER_BAR

/* Tempo ------------------------------------------------------------------
 *
 * The speed the song is played back at, in beats per minute. One column is one
 * beat, so this is what the player turns into a scroll rate. It belongs to the
 * session rather than to the sheet: nothing in the saved file records it, so
 * the prompt asks each time the player is opened.
 */

export const DEFAULT_BPM = 90
export const MIN_BPM = 20
export const MAX_BPM = 300

/** A usable whole-number tempo, whatever was typed into the prompt. */
export const clampBpm = (bpm) => {
  const value = Math.round(Number(bpm))
  // Nothing typed reads as 0, which is a request for no tempo at all rather
  // than for the slowest one going — so it falls back rather than clamping.
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BPM
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value))
}

/** Seconds a beat lasts at this tempo. */
export const secondsPerBeat = (bpm) => 60 / bpm

/**
 * The arrangement as the list of runs to play, in order. One run is one row of
 * one block: which row it is, where that row's columns start in the grid, and
 * the beat of the song it begins on.
 *
 * A block is kept as both `at` — where it stands in the arrangement, which is
 * what addresses it — and `block`, its place among the blocks that have
 * anything to play. The readout counts in the second: a block with nothing
 * under it is not a bar of silence the player should count through.
 */
export function songRuns({
  rows,
  rowIds,
  structure,
  arrangement,
}) {
  const starts = rowStarts(rows)

  const runs = []
  let beat = 0
  let block = 0

  arrangement.forEach((groupId, at) => {
    const held = rowsInGroup(structure, rowIds, groupId)
    // A block whose group has lost its last row plays nothing. The block
    // itself stays in the arrangement — emptying a group is not a way of
    // rewriting the song's shape — but there is no tab under it to sound.
    if (held.length === 0) return

    held.forEach((row, place) => {
      const cols = rowWidth(rows[row])
      runs.push({
        at,
        block,
        groupId,
        row,
        // Carried along so the player can name what it is playing without
        // having to hold on to `rowIds` itself.
        rowId: rowIds[row],
        // The first row of a block is where the group's name is written over
        // the strip, and where the heavier divider between blocks is drawn.
        opens: place === 0,
        gridStart: starts[row],
        cols,
        beat,
      })
      beat += cols
    })

    block += 1
  })

  return runs
}

/** How many beats the whole song lasts. */
export const songBeats = (runs) =>
  runs.length ? runs[runs.length - 1].beat + runs[runs.length - 1].cols : 0

/** How many blocks of the arrangement have anything to play. */
export const songBlocks = (runs) => (runs.length ? runs[runs.length - 1].block + 1 : 0)

/** Whether this sheet's arrangement asks for anything that can be played. */
export const hasSong = (sheet) => songRuns(sheet).length > 0

/** The run a beat falls in, or null before the first or past the last. */
export function runAt(runs, beat) {
  return runs.find((run) => beat >= run.beat && beat < run.beat + run.cols) ?? null
}

/** Grid column sounding on a beat, or null when the beat is outside the song. */
export function columnAt(runs, beat) {
  const run = runAt(runs, beat)
  return run ? run.gridStart + (beat - run.beat) : null
}

/** Which bar of its own run a beat sits in, counting from one. */
export const barOf = (run, beat) => Math.floor((beat - run.beat) / BEATS_PER_BAR) + 1
