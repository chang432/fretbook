/**
 * Note preview: the plucked-string sound behind the audio toggle.
 *
 * Notes are rendered into an AudioBuffer with Karplus-Strong rather than built
 * from a live feedback loop of Web Audio nodes. A DelayNode inside a cycle is
 * clamped to one render quantum (128 frames), which puts a floor of about
 * 375 Hz on such a loop at 48 kHz — most of this fretboard sits above it.
 * Running the same algorithm in JS has no such floor, and it turns exact
 * tuning into arithmetic instead of node-graph tricks.
 */

import { MAX_FRET } from './tab.js'

/**
 * Open strings in standard tuning as MIDI note numbers, high e first — the
 * same order as STANDARD_TUNING. Pitch cannot be read back off those labels:
 * they are display text, and 'G' or 'D' names no octave.
 */
export const OPEN_STRING_MIDI = [64, 59, 55, 50, 45, 40]

const A4_MIDI = 69
const A4_HZ = 440

/** MIDI note of a written cell, or null when it has none. */
export function cellMidi(value, stringIndex) {
  // '' is an unplayed position and 'x' is a muted string; neither has a pitch.
  // Fret 0 is an open string, so this can never test the value for truthiness.
  if (value === '' || value === 'x') return null
  const open = OPEN_STRING_MIDI[stringIndex]
  if (open === undefined) return null

  const fret = Number(value)
  if (!Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) return null
  return open + fret
}

/** Concert pitch of a written cell, or null when it has none. */
export function cellFrequency(value, stringIndex) {
  const midi = cellMidi(value, stringIndex)
  return midi === null ? null : A4_HZ * 2 ** ((midi - A4_MIDI) / 12)
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** What to call a MIDI note out loud — 'A4', 'F♯3'. Sharps only, no keys here. */
export const noteName = (midi) =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`

/**
 * The lowest fret on a string that sounds a note — the same note, not the same
 * pitch. Every string covers all twelve names inside its first twelve frets,
 * so this is always a fret in 0-11 and never runs off the neck.
 */
function lowestFretFor(midi, stringIndex) {
  const open = OPEN_STRING_MIDI[stringIndex]
  if (open === undefined) return null
  return (((midi - open) % 12) + 12) % 12
}

/**
 * The same note on another string: the first string in `step`'s direction with
 * nothing already standing in that position, at the lowest fret there that
 * sounds the note.
 *
 * Lowest fret, rather than the fret that would keep the pitch exactly, is the
 * point. A G played at the tenth fret of the A string is the same G at the
 * fifth fret of the D string, but by the time it reaches the low E that same
 * pitch is the fifteenth fret — a fingering nobody wants when the third fret
 * has a G on it too. So a nudge holds the note and lets the octave fall where
 * the hand is, which does mean a nudged note can end up sounding an octave
 * below what was written.
 *
 * A string already holding a note is stepped over rather than written on — a
 * correction should not cost a note somewhere else. Null when there is nowhere
 * left to go, which is the top and bottom strings and nothing else.
 */
export function nudgeTarget(column, stringIndex, step) {
  const midi = cellMidi(column[stringIndex], stringIndex)
  if (midi === null) return null

  for (let string = stringIndex + step; string >= 0 && string < column.length; string += step) {
    const fret = lowestFretFor(midi, string)
    if (fret !== null && column[string] === '') {
      return { string, fret, midi: OPEN_STRING_MIDI[string] + fret }
    }
  }
  return null
}

/** How long a note rings, and how much of it is left by the end. */
const RING_SECONDS = 1.8
const RING_FLOOR = 0.002
/** Linear fade at the tail, so cutting the ring off cannot click. */
const FADE_SECONDS = 0.02
/** Peak each note is normalised to, leaving room for notes ringing together. */
const PEAK = 0.7
/** Notes ringing at once before the oldest is cut off. */
const MAX_VOICES = 8

/**
 * One pluck, as raw samples. A burst of noise is fed round a delay line the
 * length of one period; each pass loses its highest partials to a one-zero
 * lowpass, which is what makes a plucked note darken as it fades.
 */
function renderPluck(sampleRate, frequency) {
  const total = Math.floor(sampleRate * RING_SECONDS)
  const out = new Float32Array(total)

  // The loop delays by `length` samples, plus 0.5 from the averaging filter,
  // plus the allpass's fraction — together exactly one period, so the note
  // lands in tune rather than on the nearest whole sample. Rounding instead
  // would leave a note at the top of the neck up to ~20 cents out. Biasing the
  // fraction into [0.1, 1.1) keeps the allpass away from its unstable corner.
  const period = sampleRate / frequency
  const length = Math.max(2, Math.floor(period - 0.6))
  const fraction = period - 0.5 - length
  const allpass = (1 - fraction) / (1 + fraction)

  // Feedback just under unity: whatever is left of the note after it rings.
  const loops = (sampleRate * RING_SECONDS) / length
  const feedback = Math.min(0.999, RING_FLOOR ** (1 / loops))

  const line = new Float32Array(length)
  for (let i = 0; i < length; i += 1) line[i] = Math.random() * 2 - 1

  let read = 0
  let lastSample = 0
  let lastAverage = 0
  let lastValue = 0
  let peak = 0

  for (let n = 0; n < total; n += 1) {
    const sample = line[read]
    const average = 0.5 * (sample + lastSample)
    const value = allpass * average + lastAverage - allpass * lastValue

    line[read] = value * feedback
    read = (read + 1) % length

    lastSample = sample
    lastAverage = average
    lastValue = value

    out[n] = value
    if (Math.abs(value) > peak) peak = Math.abs(value)
  }

  const scale = peak > 0 ? PEAK / peak : 0
  const fade = Math.min(total, Math.floor(sampleRate * FADE_SECONDS))
  for (let n = 0; n < total; n += 1) {
    out[n] *= scale * (n > total - fade ? (total - n) / fade : 1)
  }
  return out
}

/**
 * Owns the one AudioContext and the notes currently ringing. Returns null when
 * the browser has no Web Audio at all, which is the caller's cue to leave the
 * audio toggle off. Build it from a click: a context created outside a user
 * gesture is born suspended and stays that way.
 */
export function createAudioEngine() {
  const Context =
    typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext
  if (!Context) return null

  let context = null
  const voices = []

  // Browsers hand out a suspended context until a gesture, and suspend it
  // again when the tab is backgrounded, so this runs before every note.
  const ready = () => {
    if (!context) context = new Context()
    if (context.state === 'suspended') context.resume().catch(() => {})
    return context
  }

  return {
    resume: ready,

    play(frequency) {
      const ctx = ready()
      const samples = renderPluck(ctx.sampleRate, frequency)
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
      buffer.copyToChannel(samples, 0)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        source.disconnect()
        const at = voices.indexOf(source)
        if (at !== -1) voices.splice(at, 1)
      }

      // Hammering on the staff should not stack up an unbounded pile of rings.
      while (voices.length >= MAX_VOICES) voices.shift().stop()
      voices.push(source)
      source.start()
    },

    close() {
      voices.length = 0
      context?.close()
      context = null
    },
  }
}
