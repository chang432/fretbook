/**
 * Canvas rendering of the tab, used for the PNG export.
 *
 * This deliberately mirrors the on-screen layout (same cell pitch, row height
 * and wrap width) so the exported image matches what the user was looking at,
 * but it is drawn independently of the DOM to keep the export free of styling
 * and font-loading surprises.
 */
import { COLS_PER_BAR, STRING_COUNT, rowStarts, rowWidth, contentRows } from './tab.js'
import {
  CELL_W,
  LABEL_W,
  ROW_H,
  markPoint,
  markSegments,
  tieControl,
  tieSegment,
} from './layout.js'

const STAFF_GAP = 46
const PAD = 36
const TITLE_H = 44

const COLORS = {
  paper: '#fbf8f1',
  line: '#2f3a45',
  bar: '#c3ccd6',
  ink: '#16202b',
  label: '#7d8894',
  tie: '#a8492f',
}

export function renderTabToCanvas({ grid, rows, ties = [], marks = [] }, tuning, title, scale = 2) {
  const staves = contentRows(grid, rows)
  const starts = rowStarts(rows)
  // Rows can differ in length, so the image is as wide as its widest one.
  const widest = Math.max(...staves.map(rowWidth))
  const staffW = LABEL_W + widest * CELL_W
  const staffH = STRING_COUNT * ROW_H

  const width = PAD * 2 + staffW
  const height =
    PAD * 2 + (title ? TITLE_H : 0) + staves.length * staffH + (staves.length - 1) * STAFF_GAP

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, width, height)

  if (title) {
    ctx.fillStyle = COLORS.ink
    ctx.font = '600 22px Georgia, "Times New Roman", serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, PAD, PAD + 24)
  }

  const originY = PAD + (title ? TITLE_H : 0)

  staves.forEach((bars, staff) => {
    const top = originY + staff * (staffH + STAFF_GAP)
    const gridLeft = PAD + LABEL_W
    const cols = rowWidth(bars)
    const start = starts[staff]
    const slice = grid.slice(start, start + cols)

    // Vertical guides: a light tick per column, a stronger barline every bar.
    for (let col = 0; col <= cols; col += 1) {
      const x = Math.round(gridLeft + col * CELL_W) + 0.5
      const isBar = col % COLS_PER_BAR === 0
      ctx.strokeStyle = COLORS.bar
      ctx.lineWidth = isBar ? 1.4 : 1
      ctx.globalAlpha = isBar ? 0.9 : 0.45
      ctx.beginPath()
      ctx.moveTo(x, top + ROW_H / 2)
      ctx.lineTo(x, top + staffH - ROW_H / 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex += 1) {
      const y = Math.round(top + stringIndex * ROW_H + ROW_H / 2) + 0.5

      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(gridLeft, y)
      ctx.lineTo(gridLeft + cols * CELL_W, y)
      ctx.stroke()

      ctx.fillStyle = COLORS.label
      ctx.font = '600 14px ui-monospace, Menlo, monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(tuning[stringIndex], gridLeft - 10, y)

      slice.forEach((column, col) => {
        const value = column[stringIndex]
        if (!value) return
        const cx = gridLeft + col * CELL_W + CELL_W / 2

        // Punch a paper-coloured hole in the string line so the number reads
        // as sitting on the string, the way handwritten tab does.
        ctx.fillStyle = COLORS.paper
        ctx.beginPath()
        ctx.ellipse(cx, y, CELL_W / 2 - 2, ROW_H / 2 - 4, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = COLORS.ink
        ctx.font = '600 17px ui-monospace, Menlo, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(value, cx, y + 1)
      })
    }

    // Ties and marks last, so they read on top of the strings and numbers.
    ctx.strokeStyle = COLORS.tie
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ties.forEach((tie) => {
      const segment = tieSegment(tie, start, cols)
      if (!segment) return
      const { cx, cy } = tieControl(segment)
      ctx.beginPath()
      ctx.moveTo(gridLeft + segment.x1, top + segment.y)
      ctx.quadraticCurveTo(gridLeft + cx, top + cy, gridLeft + segment.x2, top + segment.y)
      ctx.stroke()
    })

    // Symbols are part of the note, so they take the ink colour, not the arc's.
    ctx.strokeStyle = COLORS.ink
    marks.forEach((mark) => {
      const point = markPoint(mark, start, cols)
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
