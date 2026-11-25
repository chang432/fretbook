/**
 * The song as a flat run of beats, which is what live mode plays.
 *
 * One position is one beat, so the playhead crosses a position every
 * `secondsPerBeat`. There is no arrangement any more: the song is the sheet,
 * read top to bottom and left to right, and the only thing that changes that
 * order is a group.
 *
 * A group marked in a staff is played as many times as its count says, and a
 * column standing in for a group written elsewhere plays that group's
 * positions here, its own count times. Both come out as ordinary stretches
 * of the timeline pointing back at the positions they sound — so a passage
 * played three times is three stretches over the one stretch of staff, and
 * the player never has to know why it is being asked for twice.
 */

import { groupsByName } from './sheet.js'
import { GROUP_START } from './tabV2.js'

/** Beats in a bar. Nothing divides a row, so this is only for the readout. */
export const BEATS_PER_BAR = 4

/**
 * Silent bar before the first note. Playback starts here rather than on beat
 * one, so there is a bar's worth of tempo to pick up before anything is due.
 */
export const LEAD_IN_BEATS = BEATS_PER_BAR

/* Tempo ------------------------------------------------------------------
 *
 * The speed the song is played back at, in beats per minute. It belongs to
 * the session rather than to the sheet: nothing in the saved file records it,
 * so the prompt asks each time the player is opened.
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
 * Everything a stretch of the timeline says: which row's positions it
 * sounds, where in that row they begin and end, and the beat of the song it
 * starts on. `pass` and `passes` are which time round it is, for a stretch
 * that is one of several over the same positions; `label` is what to call it
 * over the strip, and `opens` marks the stretch a readout should count as a
 * new section.
 */
const stretch = ({
  row,
  from,
  to,
  beat,
  label = '',
  pass = 1,
  passes = 1,
  opens = false,
  section = 0,
}) => ({ row, from, to, cols: to - from + 1, beat, label, pass, passes, opens, section })

/**
 * The sheet as the list of stretches to play, in order.
 *
 * Walking a row: plain positions gather into a straight run, and a group
 * interrupts it — the run so far is emitted, then the group's own positions
 * once per time it is played, then the walk goes on past it. The columns
 * that mark a group are not positions and are never sounded.
 */
export function songRuns(rows) {
  if (!Array.isArray(rows)) return []

  const written = groupsByName(rows)
  const runs = []
  let beat = 0

  rows.forEach((row, at) => {
    // Whether this row has put anything on the timeline yet: the first
    // stretch of a row is where its name is written over the strip.
    let opened = false

    /** One stretch of positions, played `times` times over. */
    const play = (which, from, to, label, times = 1) => {
      if (to < from) return
      for (let pass = 1; pass <= times; pass += 1) {
        runs.push(
          stretch({
            row: which,
            from,
            to,
            beat,
            label,
            pass,
            passes: times,
            opens: !opened,
            section: at,
          }),
        )
        beat += to - from + 1
        opened = true
      }
    }

    // Where the straight run being gathered began.
    let from = 0

    for (let col = 0; col < row.columns.length; col += 1) {
      const column = row.columns[col]
      if (!column.isGroupMark) continue

      // Whatever was gathered up to this mark is played as it stands.
      play(at, from, col - 1, row.name)

      if (column.cssMode === GROUP_START) {
        const marked = row.groups.find((each) => each.start === col)
        if (marked) {
          // The positions the group holds are the ones between its two
          // ends: the ends themselves are marks, not positions.
          play(at, marked.start + 1, marked.end - 1, marked.name, marked.repeat ?? 1)
          col = marked.end
        }
      } else if (column.isGroupRef) {
        // A group played here, sounded from wherever it is written.
        const elsewhere = written.get(column.name)
        if (elsewhere) {
          play(
            elsewhere.row,
            elsewhere.start + 1,
            elsewhere.end - 1,
            column.name,
            column.repeat ?? 1,
          )
        }
      }

      from = col + 1
    }

    play(at, from, row.columns.length - 1, row.name)
  })

  return runs
}

/** How many beats the whole song lasts. */
export const songBeats = (runs) =>
  runs.length ? runs[runs.length - 1].beat + runs[runs.length - 1].cols : 0

/** Whether this sheet has anything that can be played. */
export const hasSong = (rows) => songRuns(rows).some((run) => run.cols > 0)

/** The run a beat falls in, or null before the first or past the last. */
export function runAt(runs, beat) {
  return runs.find((run) => beat >= run.beat && beat < run.beat + run.cols) ?? null
}

/** The position sounding on a beat, as row and column, or null. */
export function columnAt(runs, beat) {
  const run = runAt(runs, beat)
  return run ? { row: run.row, col: run.from + (beat - run.beat) } : null
}

/** Which bar of its own run a beat sits in, counting from one. */
export const barOf = (run, beat) => Math.floor((beat - run.beat) / BEATS_PER_BAR) + 1
