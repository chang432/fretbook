/**
 * One position on one string: the box a fret is written in, and the piece of
 * string it is written on.
 *
 * This draws one: `cell` is the Cell itself, from utils/cell.js, which is
 * what knows its value and what it will accept. Where it stands is the
 * editor's business — `row`, `col` and `string` are only ever read back out
 * in the name below — and what is typed goes straight up to `onChange`
 * unexamined, since the model is what settles a written cell.
 *
 * `mode` is the column's cssMode, which it is drawn with: a cell in the
 * column that opens or closes a group carries that column's share of the
 * bracket. The slot around the input is what carries it, because an input
 * is a replaced element and draws no ::before or ::after of its own.
 *
 * A cell in such a column is not a position to write in — the column is
 * given over to saying where the group begins or ends — so it takes no
 * typing and no focus. It is still drawn as a cell, and still reads out as
 * one, because it still stands in the run.
 *
 * `row` and `col` are counted from 0, the way the sheet counts them, and are
 * spoken as 1 and up, the way a person does.
 *
 * The string is drawn by the cell itself — a segment per position rather
 * than one line across the row — so that a position can be left out of it:
 * see `.string-row--segmented` in styles/staff-strings.css. Adding
 * `cell--unstrung` to the class list below is what skips one.
 */
export default function Cell({ cell, row, col, string, mode = false, onChange }) {
  return (
    <span className={`cell-slot${mode ? ` cell-slot--${mode}` : ''}`}>
      <input
        className={`cell${cell.isEmpty ? '' : ' cell--filled'}`}
        value={cell.value}
        inputMode="numeric"
        autoComplete="off"
        spellCheck="false"
        // The two columns that mark a group out are not written in. Both
        // halves are needed: readOnly turns away what is typed, and -1
        // takes the cell out of the tab order behind it.
        readOnly={Boolean(mode)}
        tabIndex={mode ? -1 : undefined}
        // Positions start again at 1 on every row, so the row is named here
        // too: "position 1" alone would point at one cell per row rather than
        // at one cell.
        aria-label={`Row ${row + 1}, string ${string}, position ${col + 1}`}
        // What was typed, as typed: a cell settles what it will take when the
        // model writes it, so there is nothing to check here.
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => !mode && event.target.select()}
      />
    </span>
  )
}
