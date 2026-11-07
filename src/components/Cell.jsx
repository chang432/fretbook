import { useEffect, useRef, useState } from 'react'
import { normalizeRepeat } from '../utils/tabV2.js'

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
 * No cell of a group's column is a position to write a note in, but the
 * two kinds are not refused in the same way. The columns marking the ends
 * are pressed instead — that is what opens the group, through `onPress` —
 * and take no typing at all. The one carrying the count is typed in, but
 * what is typed there is the count: it goes to `onRepeat`, and the model's
 * cell underneath stays empty.
 *
 * `repeat` is that count, and the cell on the top string of its column is
 * the one that says it. The cell writes it out itself — it is the cell's
 * own content, and the stylesheet only says how it looks. It says it two
 * ways: `x3` at rest, which is how a count is read, and `3` while it is
 * being typed in, which is what is actually being changed. The `x` comes
 * back as soon as the press that is editing it goes elsewhere.
 *
 * `inGroup` is true while the group this cell stands in is the one open,
 * which is how a group's cells stand back from the name laid over them.
 *
 * `row` and `col` are counted from 0, the way the sheet counts them, and are
 * spoken as 1 and up, the way a person does.
 *
 * The string is drawn by the cell itself — a segment per position rather
 * than one line across the row — so that a position can be left out of it:
 * see `.string-row--segmented` in styles/staff-strings.css. Adding
 * `cell--unstrung` to the class list below is what skips one.
 */
export default function Cell({
  cell,
  row,
  col,
  string,
  mode = false,
  repeat = null,
  inGroup = false,
  onChange,
  onPress,
  onRepeat,
}) {
  // Set while the count is being typed in, which is the only time this
  // cell shows the bare number. It is about the press rather than about
  // the sheet, so it is held here and nowhere else.
  const [counting, setCounting] = useState(false)
  const box = useRef(null)

  // Take the count the moment it is pressed, so the first thing typed
  // replaces it rather than being added to it. It cannot be done in the
  // press itself: the `x` comes off in the same breath, and the value
  // changing underneath would drop the selection again. This runs once the
  // bare number is on the page.
  useEffect(() => {
    if (counting) box.current?.select()
  }, [counting])

  // The top cell of a repeat column is the one that says the count. The
  // model's cell knows which string it is on, so there is nothing for the
  // editor to tell it.
  const says = repeat !== null && cell.string === 0
  const count = !says ? null : counting ? String(repeat) : `x${repeat}`

  // Pressed rather than written in; and written in, but not with a note.
  const presses = mode === 'group-start' || mode === 'group-end'
  const takesTyping = !mode || says

  const classes = ['cell']
  if (says) classes.push('cell--repeat')
  else if (!cell.isEmpty) classes.push('cell--filled')

  const slot = ['cell-slot']
  if (mode) slot.push(`cell-slot--${mode}`)
  if (inGroup) slot.push('cell-slot--in-group')

  return (
    <span className={slot.join(' ')}>
      <input
        ref={box}
        className={classes.join(' ')}
        value={count ?? cell.value}
        inputMode="numeric"
        autoComplete="off"
        spellCheck="false"
        // A cell that is pressed rather than written in turns away what is
        // typed, and stays out of the tab order behind the press.
        readOnly={!takesTyping}
        tabIndex={presses ? -1 : undefined}
        // Positions start again at 1 on every row, so the row is named here
        // too: "position 1" alone would point at one cell per row rather than
        // at one cell.
        aria-label={
          says
            ? `Times the group before here is played, currently ${repeat}`
            : `Row ${row + 1}, string ${string}, position ${col + 1}`
        }
        onMouseDown={presses ? onPress : undefined}
        // A count is settled here, since it is this cell's own; a note is
        // passed on as typed, since the model is what settles those.
        onChange={(event) =>
          says
            ? onRepeat(normalizeRepeat(event.target.value, repeat))
            : onChange(event.target.value)
        }
        onFocus={(event) => {
          if (!takesTyping) return
          // The count is taken by the effect above instead, once the `x`
          // is off it; everything else can be taken here and now.
          if (says) setCounting(true)
          else event.target.select()
        }}
        onBlur={() => says && setCounting(false)}
      />
    </span>
  )
}
