/**
 * The song as a flat run of beats, which is what live mode plays.
 *
 * One grid column is one beat, so a bar (COLS_PER_BAR columns) is one bar of
 * 4/4 — the playhead crosses a column every `secondsPerBeat`. The song is cut
 * into runs here rather than in the view, one per row: the player walks a flat
 * list of stretches and never has to work out where a row begins.
 */

import { COLS_PER_BAR, createRowIds, rowStarts, rowWidth } from './tab.js'

/** Beats in a bar. One column is one beat, so this is the bar width. */
export const BEATS_PER_BAR = COLS_PER_BAR

/**
 * Silent bar before the first note. Playback starts here rather than on beat
 * one, so there is a bar's worth of tempo to pick up before anything is due.
 */
export const LEAD_IN_BEATS = COLS_PER_BAR

/** Seconds a beat lasts at this tempo. */
export const secondsPerBeat = (bpm) => 60 / bpm

/**
 * The song as the list of runs to play, in order: which row each one is, where
 * that row's columns start in the grid, and the beat of the song it begins on.
 * The sheet is played top to bottom, a row at a time — the order it is written
 * in.
 */
export function songRuns({ rows, rowIds = createRowIds(rows.length) }) {
  const starts = rowStarts(rows)

  let beat = 0
  return rows.map((bars, row) => {
    const run = {
      row,
      // Carried along so the player can name what it is playing without
      // having to hold on to `rowIds` itself.
      rowId: rowIds[row],
      gridStart: starts[row],
      cols: rowWidth(bars),
      beat,
    }
    beat += run.cols
    return run
  })
}

/** How many beats the whole song lasts. */
export const songBeats = (runs) =>
  runs.length ? runs[runs.length - 1].beat + runs[runs.length - 1].cols : 0

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
