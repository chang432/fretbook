/**
 * Canvas rendering of the tab, used for the PNG export.
 *
 * This deliberately mirrors the on-screen layout — same cell pitch, row
 * height and bracket geometry — so the exported image matches what the
 * writer was looking at, but it is drawn independently of the DOM to keep
 * the export free of styling and font-loading surprises.
 */
import { STRING_COUNT } from './cell.js'
import { GROUP_END, GROUP_START } from './tabV2.js'
import {
  CELL_W,
  LABEL_W,
  ROW_H,
  markPoint,
  markSegments,
  tieControl,
  tieSegment,
} from './layout.js'

const STAFF_GAP = 52
const PAD = 36
const TITLE_H = 44
const NAME_H = 20

/** The bracket, to the same measurements the stylesheet uses. */
const BAR_W = 3
const ARROW = CELL_W / 2 - BAR_W

const COLORS = {
  paper: '#fbf8f1',
  page: '#ece7dc',
  line: '#2f3a45',
  ink: '#16202b',
  label: '#7d8894',
  tie: '#a8492f',
}

/** A filled triangle, for the half-arrows that close a bracket. */
function triangle(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.closePath()
  ctx.fill()
}

/**
 * One end of a group: the bar down the side of its column, and a half-arrow
 * at each end of that bar pointing in over what the group holds. `facing` is
 * +1 for an opening, which stands on the left of its column and points
 * right, and −1 for a closing.
 */
function bracket(ctx, { x, top, bottom, facing }) {
  const edge = facing > 0 ? x : x + CELL_W - BAR_W

  ctx.fillStyle = COLORS.ink
  ctx.fillRect(edge, top, BAR_W, bottom - top)

  const inner = facing > 0 ? edge + BAR_W : edge
  triangle(ctx, [
    [inner, top],
    [inner + facing * ARROW, top],
    [inner, top + ARROW],
  ])
  triangle(ctx, [
    [inner, bottom],
    [inner + facing * ARROW, bottom],
    [inner, bottom - ARROW],
  ])
}

/** The count a group is played, boxed between the top two string lines. */
function count(ctx, { x, top, repeat }) {
  const height = ROW_H + 2
  const y = top - 1

  ctx.fillStyle = COLORS.paper
  ctx.fillRect(x, y, CELL_W, height)
  ctx.strokeStyle = COLORS.ink
  ctx.lineWidth = BAR_W
  ctx.strokeRect(x + BAR_W / 2, y + BAR_W / 2, CELL_W - BAR_W, height - BAR_W)

  ctx.fillStyle = COLORS.ink
  ctx.font = '600 11px Audiowide, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`x${repeat ?? 1}`, x + CELL_W / 2, y + height / 2 + 1)
}

export function renderTabToCanvas({ rows, ties, marks }, tuning, title, scale = 2) {
  // Rows can differ in length, so the image is as wide as its widest one.
  const widest = Math.max(1, ...rows.map((row) => row.length))
  const staffW = LABEL_W + widest * CELL_W
  const staffH = STRING_COUNT * ROW_H
  const named = rows.some((row) => row.name)

  const width = PAD * 2 + staffW
  const height =
    PAD * 2 +
    (title ? TITLE_H : 0) +
    rows.length * (staffH + (named ? NAME_H : 0)) +
    (rows.length - 1) * STAFF_GAP

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  ctx.fillStyle = COLORS.page
  ctx.fillRect(0, 0, width, height)

  if (title) {
    ctx.fillStyle = COLORS.ink
    ctx.font = '600 22px Audiowide, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, PAD, PAD + 24)
  }

  const originY = PAD + (title ? TITLE_H : 0)

  rows.forEach((row, staff) => {
    const head = originY + staff * (staffH + (named ? NAME_H : 0) + STAFF_GAP)
    const top = head + (named ? NAME_H : 0)
    const gridLeft = PAD + LABEL_W
    const cols = row.length
    // The two lines the staff is ruled to, which is where every bracket in
    // it begins and ends.
    const ruledTop = Math.round(top + ROW_H / 2) + 0.5
    const ruledBottom = Math.round(top + (STRING_COUNT - 1) * ROW_H + ROW_H / 2) + 0.5

    // A row that has been named is called by its name, written over it —
    // the staff is too short to write down the side of in an image.
    if (row.name) {
      ctx.fillStyle = COLORS.label
      ctx.font = '600 13px Audiowide, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(row.name, gridLeft, head + 14)
    }

    // No vertical ruling: the staff is the strings and what is written on them.
    for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex += 1) {
      const y = Math.round(top + stringIndex * ROW_H + ROW_H / 2) + 0.5

      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(gridLeft, y)
      ctx.lineTo(gridLeft + cols * CELL_W, y)
      ctx.stroke()

      ctx.fillStyle = COLORS.label
      ctx.font = '600 14px Audiowide, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(tuning[stringIndex], gridLeft - 10, y)

      row.columns.forEach((column, col) => {
        // Nothing is written on a column that marks a group; what it says is
        // drawn below, once for the column rather than once per string.
        if (column.isGroupMark) return
        const value = column.cell(stringIndex).value
        if (!value) return
        const cx = gridLeft + col * CELL_W + CELL_W / 2

        // Punch a page-coloured hole in the string line so the number reads
        // as sitting on the string, the way handwritten tab does.
        ctx.fillStyle = COLORS.page
        ctx.beginPath()
        ctx.ellipse(cx, y, CELL_W / 2 - 2, ROW_H / 2 - 4, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = COLORS.ink
        ctx.font = '600 17px Audiowide, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(value, cx, y + 1)
      })
    }

    // The brackets, over the strings they are ruled between.
    row.columns.forEach((column, col) => {
      if (!column.isGroupMark) return
      const x = gridLeft + col * CELL_W

      if (column.cssMode === GROUP_START || column.isGroupRef) {
        bracket(ctx, { x, top: ruledTop, bottom: ruledBottom, facing: 1 })
      }
      if (column.cssMode === GROUP_END || column.isGroupRef) {
        bracket(ctx, { x, top: ruledTop, bottom: ruledBottom, facing: -1 })
      }

      // Which group is played here, in a ring across the middle of the staff.
      if (column.isGroupRef) {
        const cy = top + (STRING_COUNT / 2) * ROW_H
        const radius = ROW_H / 2 - 3

        ctx.fillStyle = COLORS.paper
        ctx.beginPath()
        ctx.arc(x + CELL_W / 2, cy, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = COLORS.ink
        ctx.lineWidth = BAR_W
        ctx.stroke()

        ctx.fillStyle = COLORS.ink
        ctx.font = '600 15px Audiowide, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(column.name ?? '', x + CELL_W / 2, cy + 1)
      }

      if (column.repeat !== null) count(ctx, { x, top: ruledTop, repeat: column.repeat })
    })

    // Ties and marks last, so they read on top of the strings and numbers.
    ctx.strokeStyle = COLORS.tie
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ties
      .filter((tie) => tie.row === staff)
      .forEach((tie) => {
        const segment = tieSegment(tie, 0, cols)
        if (!segment) return
        const { cx, cy } = tieControl(segment)
        ctx.beginPath()
        ctx.moveTo(gridLeft + segment.x1, top + segment.y)
        ctx.quadraticCurveTo(gridLeft + cx, top + cy, gridLeft + segment.x2, top + segment.y)
        ctx.stroke()
      })

    // Symbols are part of the note, so they take the ink colour, not the arc's.
    ctx.strokeStyle = COLORS.ink
    marks
      .filter((mark) => mark.row === staff)
      .forEach((mark) => {
        const point = markPoint(mark, 0, cols)
        if (!point) return
        const stroke = markSegments(gridLeft + point.cx, top + point.cy)
        ctx.beginPath()
        ctx.moveTo(stroke.start[0], stroke.start[1])
        stroke.parts.forEach(([x, y]) => ctx.lineTo(x, y))
        ctx.stroke()
      })
  })

  return canvas
}

/** Render the tab and resolve with a PNG blob. */
export function renderTabToPngBlob(sheet, tuning, title) {
  const canvas = renderTabToCanvas(sheet, tuning, title)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
