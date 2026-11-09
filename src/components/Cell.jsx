import { useEffect, useRef, useState } from 'react'
import { STRING_COUNT, normalizeRepeat } from '../utils/tabV2.js'

/**
 * The string whose foot is the middle of the staff: with six strings, the
 * line between the third and the fourth. What a group hangs its name and
 * its count on.
 */
const MIDDLE_STRING = Math.floor(STRING_COUNT / 2) - 1

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
 * kinds are not refused in the same way. The columns marking a group's ends
 * are pressed instead — that is what opens the group, through `onPress` —
 * and so are the two standing in for a group played here, which is how the
 * button for taking that one off the sheet is asked for. None of them takes
 * any typing.
 *
 * All but one cell, that is. A group's count is written on the column that
 * closes it, so one cell of that column is the count rather than part of
 * the press: it is typed in, what is typed there goes to `onRepeat`, and
 * the model's cell underneath stays empty.
 *
 * `repeat` is that count, and the cell on the top string of its column is
 * the one that says it: the box is that cell, lifted out of its place and
 * hung on the line between the top two strings instead. The cell
 * writes the count out itself — it is the cell's own content, and the
 * stylesheet only says how it looks. It says it two ways: `x3` at rest,
 * which is how a count is read, and `3` while it is being typed in, which
 * is what is actually being changed. The `x` comes back as soon as the
 * press that is editing it goes elsewhere.
 *
 * `inGroup` is true while the group this cell stands in is the one open,
 * which is how a group's cells stand back from the name laid over them.
 *
 * A column standing in for a whole group played here is not a position at
 * all: nothing can be written in it, the cell halfway down it carries the
 * group's name in a ring, and the strings do not run through it — bar the
 * outer two, which are the lines the staff is ruled to and carry straight
 * on through. `name` is that name, and `onSelect` is how a writable cell
 * says it is the one being worked on, so the menu over it knows where it
 * stands.
 *
 * `closes` is set on every position a group being opened could end at,
 * while it is being opened. Such a cell is lit and pressed rather than
 * written in, whatever it holds — the press says where the group ends and
 * must not land in the cell — and `closesNow` is the one the pointer is
 * over, which lights the whole of its column rather than the one cell.
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
  name = null,
  inGroup = false,
  onChange,
  onPress,
  onRepeat,
  onSelect,
  onNavigate,
  onPlay,
  tieTarget = false,
  onTieTarget,
  onTieHover,
  closes = false,
  closesNow = false,
  onClose,
  onCloseHover,
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

  // The count is the top cell of the column that closes a group. The
  // model's cell knows which string it is on, so there is nothing for the
  // editor to tell it.
  const says = repeat !== null && cell.string === 0
  const count = !says ? null : counting ? String(repeat) : `x${repeat}`

  // A group played here from elsewhere, and the one cell of its column
  // that says which group it is: halfway down, where the ring is drawn.
  // The count is on the top cell of the same column — see `says` above.
  const stands = mode === 'group-ref'
  const named = stands && cell.string === MIDDLE_STRING ? name : null

  // The top and bottom strings, which are the two lines the staff is ruled
  // to. The bars of a group's column and the arrows off them both stop
  // there, so those two lines keep running through the column while the
  // four between them stop either side of it.
  const ruled = cell.string === 0 || cell.string === STRING_COUNT - 1

  // Pressed rather than written in; and written in, but not with a note.
  // The cell carrying the count is the exception on a closing column: it
  // takes the typing, so it must not take the press as well.
  const presses =
    !says && (mode === 'group-start' || mode === 'group-end' || stands)
  const takesTyping = !mode || says

  // What the cell is showing — the count, a group's name, or a fret — which
  // is one thing or none.
  const classes = ['cell']
  if (tieTarget) classes.push('cell--tie-target')
  if (says) classes.push('cell--repeat')
  else if (named) classes.push('cell--group-name')
  else if (!cell.isEmpty) classes.push('cell--filled')

  // Pressed rather than written in, so it does not light up under the
  // pointer the way a position about to be written in does. A position
  // waiting to close a group is pressed too, and has a light of its own.
  if (presses || closes) classes.push('cell--quiet')
  // No string runs through a column that stands for a group, except the
  // two the staff is ruled to.
  if (stands && !ruled) classes.push('cell--unstrung')

  const slot = ['cell-slot']
  if (mode) slot.push(`cell-slot--${mode}`)
  if (closes) slot.push('cell-slot--closing')
  if (closesNow) slot.push('cell-slot--closing-now')
  // The count is lifted out of this slot and hung on the line below it, so
  // the slot is what the box is placed from — and the one thing the two
  // kinds of closing column have in common, which is why the box is drawn
  // off this rather than off either of their modes.
  if (says) slot.push('cell-slot--counted')
  if (inGroup) slot.push('cell-slot--in-group')

  return (
    <span className={slot.join(' ')}>
      <input
        ref={box}
        className={classes.join(' ')}
        value={count ?? named ?? cell.value}
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
            : stands
              ? `Group ${name} is played here`
              : `Row ${row + 1}, string ${string}, position ${col + 1}`
        }
        onPointerDown={!mode && !closes && !tieTarget && !cell.isEmpty ? onPlay : undefined}
        // Closing a group outranks everything: while one is being
        // opened, every lit position is a press and nothing else.
        onMouseDown={
          closes
            ? (event) => {
                event.preventDefault()
                onClose()
              }
            : tieTarget
              ? (event) => {
                  event.preventDefault()
                  onTieTarget()
                }
              : presses
                ? onPress
                : undefined
        }
        onMouseEnter={closes ? onCloseHover : tieTarget ? onTieHover : undefined}
        onKeyDown={!mode ? onNavigate : undefined}
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
          else {
            event.target.select()
            // Only a position worth writing in is worth a menu over it.
            onSelect?.(event.target)
          }
        }}
        onBlur={() => says && setCounting(false)}
      />
    </span>
  )
}
