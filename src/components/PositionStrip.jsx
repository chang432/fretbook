/**
 * A row of one control per position, standing above a staff on the same column
 * pitch so each control lines up with the position it acts on.
 *
 * Three strips are this shape — the shift anchors, copy mode's range circles,
 * and its paste buttons — so the geometry lives here once and each caller says
 * only what its own buttons do. `cell` is handed the absolute grid column and
 * its index within the staff, and returns the props for that button.
 */
export default function PositionStrip({ className, label, start, cols, cell }) {
  return (
    <div className={`position-strip ${className}`} role="group" aria-label={label}>
      {Array.from({ length: cols }, (_, indexInStaff) => {
        const col = start + indexInStaff
        const { className: extra = '', ...rest } = cell(col, indexInStaff)

        return (
          <button
            key={col}
            type="button"
            className={`position-cell ${extra}`.trim()}
            {...rest}
          />
        )
      })}
    </div>
  )
}
