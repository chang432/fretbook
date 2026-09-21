/**
 * The song as a flat run of beats, which is what live mode plays.
 *
 * One grid column is one beat, so a bar (COLS_PER_BAR columns) is one bar of
 * 4/4 — the playhead crosses a column every `secondsPerBeat`. The running
 * order is expanded here rather than in the view: a group played three times
 * is three runs, so a repeated row is three separate stretches of the timeline
 * that all point back at the same columns of the grid.
 */

import { COLS_PER_BAR, createGroups, readGroupSlot, rowOfGroup, rowStarts, rowWidth } from './tab.js'

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
 * The running order as the list of runs to play, in order: which row each one
 * is, where that row's columns start in the grid, and the beat of the song it
 * begins on. A sheet with nothing in the Groups strip plays its rows once
 * each, top to bottom — the order they are written in.
 *
 * A slot's repeat count is spent here: a slot calling for its group three
 * times is three runs, the same as writing that group in three slots.
 *
 * A slot names a group rather than a place on the page, so each one is looked
 * up in `groups` to find the row now carrying it. Reordering the rows changes
 * where the tab is written, not which of it a slot asks for.
 */
export function songRuns({ rows, groups = createGroups(rows.length), structure = [] }) {
  const chosen = structure.flatMap((entry) => {
    const slot = readGroupSlot(entry)
    const row = slot ? rowOfGroup(groups, slot.group) : -1
    // A slot calling for a group no row carries any more simply plays nothing.
    if (row < 0) return []
    return Array.from({ length: slot.repeat }, () => row)
  })
  const order = chosen.length ? chosen : rows.map((_, row) => row)
  const starts = rowStarts(rows)

  let beat = 0
  return order.map((row, slot) => {
    const run = {
      slot,
      row,
      // Carried along so the player can name what it is playing without
      // having to hold on to `groups` itself.
      group: groups[row],
      gridStart: starts[row],
      cols: rowWidth(rows[row]),
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
