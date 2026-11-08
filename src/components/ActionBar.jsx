import { useLayoutEffect, useState } from 'react'

/** Room the bar needs above what it hangs off before it stands below it. */
const CLEARANCE = 52

/**
 * A small bar of buttons standing over whatever is being worked on — the
 * position being written in, a group held open, the column a group is
 * played in. One shape for all three, so they appear in the same place and
 * read as the same thing happening.
 *
 * Positioned `fixed` from the anchor's own rect rather than drawn beside it
 * in the staff, so a row scrolling inside itself cannot clip the bar, and it
 * follows whatever it is anchored to. It flips below the anchor when there
 * is no room above.
 *
 * Nothing in it should take the focus: every press inside turns the default
 * away, so the cell underneath stays selected and the bar does not vanish
 * out from under the press that opened it. That is each button's own doing —
 * see the two that use this.
 *
 * Note for anything hanging a `fixed` panel off a button in here: the bar is
 * centred over its anchor with a transform, and a transform makes its box the
 * ground that anything `fixed` inside it is measured from. Such a panel has
 * to be sent to the end of the document instead — see CellMenu.
 */
export default function ActionBar({ anchor, label, children }) {
  const [place, setPlace] = useState(null)

  useLayoutEffect(() => {
    if (!anchor) return undefined

    const position = () => {
      const rect = anchor.getBoundingClientRect()
      setPlace({
        x: rect.left + rect.width / 2,
        y: rect.top < CLEARANCE ? rect.bottom + 6 : rect.top - 6,
        below: rect.top < CLEARANCE,
      })
    }

    position()
    // `true` catches the row scrolling as well as the page.
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [anchor])

  if (!anchor || !place) return null

  return (
    <div
      className="action-bar"
      style={{
        left: `${place.x}px`,
        top: `${place.y}px`,
        transform: `translate(-50%, ${place.below ? '0' : '-100%'})`,
      }}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  )
}
