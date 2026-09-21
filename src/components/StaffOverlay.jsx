import { CELL_W, ROW_H, markPath, markPoint, tiePath, tieSegment } from '../utils/layout.js'
import { STRING_COUNT } from '../utils/tab.js'

/**
 * Everything drawn over one staff line that is not a number: tie arcs joining
 * two positions of the same fret, and the symbols sitting above marked notes.
 *
 * `cols` is this row's own width — rows can differ in length. Ties that run
 * past either edge are clipped by `tieSegment`, so a tie spanning a wrap draws
 * as an open arc on each line it crosses.
 */
export default function StaffOverlay({ ties, marks, staffStart, cols, preview }) {
  const tieSegments = ties
    .map((tie) => ({ tie, segment: tieSegment(tie, staffStart, cols) }))
    .filter(({ segment }) => segment)

  const markPoints = marks
    .map((mark) => ({ mark, point: markPoint(mark, staffStart, cols) }))
    .filter(({ point }) => point)

  const previewSegment = preview ? tieSegment(preview, staffStart, cols) : null

  return (
    <svg
      className="staff-overlay"
      width={cols * CELL_W}
      height={STRING_COUNT * ROW_H}
      aria-hidden="true"
    >
      {tieSegments.map(({ tie, segment }) => (
        <path
          key={`${tie.string}:${tie.from}:${tie.to}`}
          className="tie"
          d={tiePath(segment)}
        />
      ))}
      {previewSegment && <path className="tie tie--preview" d={tiePath(previewSegment)} />}
      {markPoints.map(({ mark, point }) => (
        <path
          key={`${mark.string}:${mark.col}`}
          className="mark"
          d={markPath(point.cx, point.cy)}
        />
      ))}
    </svg>
  )
}
