/**
 * One cell: what is written on one string at one position.
 *
 * A cell knows which string it sits on and what is written there, and
 * nothing else — not which position it stands at, and not which row that
 * position is in. Its column knows the first and its row the second.
 *
 * A cell never changes: `with` hands back a new one, or the very same one
 * when what it is given comes to nothing new. Instances are frozen, so the
 * empty cells below can be shared between every blank position on a sheet
 * without any of them being able to surprise the others.
 *
 * What a cell will accept is settled here, on the way in, so a cell that
 * exists is a cell that can be played. There is nowhere else to validate it.
 */

/** Strings on the instrument, and so cells in a column. */
export const STRING_COUNT = 6

/** Highest fret a cell will take. */
export const MAX_FRET = 24

/** What a muted string is written as. */
const MUTED = 'x'

/**
 * Restrict what is typed to what can sit on a tab line: a fret number
 * (0-24) or a muted-string marker. Anything else comes to nothing.
 */
function normalize(raw) {
  const cleaned = String(raw).trim().toLowerCase()
  if (cleaned === '') return ''
  if (cleaned.endsWith(MUTED)) return MUTED

  const digits = cleaned.replace(/\D/g, '')
  if (digits === '') return ''

  // Typing a 3rd digit shifts the cell left ("12" + "3" -> "23") instead of
  // being swallowed, so a mistyped fret can be corrected without clearing.
  const twoDigits = digits.slice(-2)
  const value = Number(twoDigits)
  return value <= MAX_FRET ? String(value) : twoDigits.slice(-1)
}

export class Cell {
  /**
   * @param {number} string which string this sits on, 0 at the top
   * @param {string} value  what is written there, settled on the way in
   */
  constructor(string, value = '') {
    this.string = string
    this.value = normalize(value)
    // A cell is its value; nothing may edit one in place, which is what lets
    // `with` return `this` and lets the empty cells below be shared.
    Object.freeze(this)
  }

  /** Nothing is written here. */
  get isEmpty() {
    return this.value === ''
  }

  /** The string is struck muted — a written thing, not an empty one. */
  get isMuted() {
    return this.value === MUTED
  }

  /** The fret as a number, or null when there is no note to fret. */
  get fret() {
    return this.isEmpty || this.isMuted ? null : Number(this.value)
  }

  /**
   * This cell with something else written in it. Returns `this` when what is
   * given normalizes to what is already here, so an edit that changes
   * nothing can be recognised by identity alone, all the way up.
   */
  with(value) {
    const next = normalize(value)
    return next === this.value ? this : new Cell(this.string, next)
  }

  /** The written form, which is what the ASCII and JSON exports will want. */
  toString() {
    return this.value
  }
}

/** One shared empty cell per string: they are frozen and tell nothing apart. */
const EMPTY = Object.freeze(
  Array.from({ length: STRING_COUNT }, (_, string) => new Cell(string)),
)

/** The empty cell for a string. */
export const emptyCell = (string) => EMPTY[string]
