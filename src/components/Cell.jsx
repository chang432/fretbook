import { normalizeCell } from '../utils/tab.js'

/**
 * One position on one string: the box a fret is written in, and the piece of
 * string it is written on.
 *
 * The cell owns how a position looks and behaves — what it is called out
 * loud, what it will accept, and which of its states it is in. Where it
 * stands is the editor's business: `row`, `col` and `string` are only ever
 * read back out in the name below, and a new value is handed straight up to
 * `onChange` rather than written anywhere here.
 *
 * `row` and `col` are counted from 0, the way the sheet counts them, and are
 * spoken as 1 and up, the way a person does.
 *
 * The string is drawn by the cell itself — a segment per position rather
 * than one line across the row — so that a position can be left out of it:
 * see `.string-row--segmented` in styles/staff-strings.css. Adding
 * `cell--unstrung` to the class list below is what skips one.
 */
export default function Cell({ value, row, col, string, onChange }) {
  return (
    <input
      className={`cell${value ? ' cell--filled' : ''}`}
      value={value}
      inputMode="numeric"
      autoComplete="off"
      spellCheck="false"
      // Positions start again at 1 on every row, so the row is named here
      // too: "position 1" alone would point at one cell per row rather than
      // at one cell.
      aria-label={`Row ${row + 1}, string ${string}, position ${col + 1}`}
      // Frets are checked on the way in, so a cell can only ever hold
      // something playable.
      onChange={(event) => onChange(normalizeCell(event.target.value))}
      onFocus={(event) => event.target.select()}
    />
  )
}
