/**
 * Staff geometry shared by the on-screen SVG overlay and the PNG export, so an
 * exported image lines up with what was on screen.
 *
 * NOTE: `--cell-w` / `--row-h` in styles.css mirror CELL_W / ROW_H. The DOM
 * staff is laid out by CSS, so these two have to be changed together.
 */

export const CELL_W = 36
export const ROW_H = 34
export const LABEL_W = 30

/** How far the arc keeps clear of the notes it joins. */
const ARC_INSET = 9

/** Peak height of the arc above the string, as a fraction of its span. */
const ARC_RISE = 0.09
const ARC_MIN = 7
const ARC_MAX = 16

/**
 * Clip a tie to one staff line and convert it to coordinates relative to that
 * staff's top-left. A tie that spans a wrap is drawn as one open-ended segment
 * per staff; returns null when the tie does not reach this staff at all.
 */
export function tieSegment(tie, staffStart, colsPerLine) {
  const staffEnd = staffStart + colsPerLine - 1
  if (tie.to < staffStart || tie.from > staffEnd) return null

  const startsHere = tie.from >= staffStart
  const endsHere = tie.to <= staffEnd

  return {
    x1: startsHere ? (tie.from - staffStart + 0.5) * CELL_W + ARC_INSET : 0,
    x2: endsHere
      ? (tie.to - staffStart + 0.5) * CELL_W - ARC_INSET
      : colsPerLine * CELL_W,
    y: tie.string * ROW_H + ROW_H / 2,
  }
}

/**
 * Control point of the quadratic curve that bows the arc above the string. A
 * quadratic peaks halfway to its control point, so the offset is doubled to
 * make ARC_MIN/ARC_MAX read as the height actually drawn.
 */
export function tieControl({ x1, x2, y }) {
  const rise = Math.min(ARC_MAX, Math.max(ARC_MIN, (x2 - x1) * ARC_RISE))
  return { cx: (x1 + x2) / 2, cy: y - rise * 2 }
}

/** SVG path for a clipped tie segment. */
export function tiePath(segment) {
  const { cx, cy } = tieControl(segment)
  return `M ${segment.x1} ${segment.y} Q ${cx} ${cy} ${segment.x2} ${segment.y}`
}

/* Marks ----------------------------------------------------------------- */

/** Symbol size and how far it floats above the string it belongs to. */
export const MARK_WIDTH = 20
const MARK_STEPS = 4
const MARK_AMP = 3.2
const MARK_RISE = 15

/** Where a mark's symbol is drawn, or null when it misses this staff line. */
export function markPoint(mark, staffStart, colsPerLine) {
  if (mark.col < staffStart || mark.col >= staffStart + colsPerLine) return null
  return {
    cx: (mark.col - staffStart + 0.5) * CELL_W,
    cy: mark.string * ROW_H + ROW_H / 2 - MARK_RISE,
  }
}

/**
 * The zigzag as a start point plus straight strokes, in the shape both
 * renderers need. Reused at button size, which is why it is parameterised by
 * centre point rather than tied to a staff position.
 */
export function markSegments(cx, cy) {
  const step = MARK_WIDTH / MARK_STEPS
  const left = cx - MARK_WIDTH / 2
  const parts = []

  for (let i = 0; i < MARK_STEPS; i += 1) {
    parts.push([left + (i + 1) * step, cy + (i % 2 === 0 ? -MARK_AMP : MARK_AMP)])
  }
  return { start: [left, cy + MARK_AMP], parts }
}

/** SVG path for the symbol centred on (cx, cy). */
export function markPath(cx, cy) {
  const { start, parts } = markSegments(cx, cy)
  return parts.reduce(
    (path, [x, y]) => `${path} L ${x} ${y}`,
    `M ${start[0]} ${start[1]}`,
  )
}
