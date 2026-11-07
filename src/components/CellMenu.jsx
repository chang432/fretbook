import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Popover from './Popover.jsx'
import { ImportIcon } from './icons.jsx'

/** Room the bar needs above a cell before it has to stand below it instead. */
const CLEARANCE = 52

/**
 * The buttons that come up over the position being written in. One so far:
 * it opens the sheet's groups, and choosing one puts that group down here.
 *
 * Positioned `fixed` from the cell's own rect, so a row scrolling inside
 * itself cannot clip it, and it follows whatever it is anchored to. Nothing
 * in it takes the focus — every press turns the default away — so the cell
 * stays selected underneath and the bar does not vanish out from under the
 * press that opened it.
 *
 * The list of groups is sent to the end of the document rather than drawn
 * inside the bar. The bar is centred over its cell with a transform, and a
 * transform makes its box the ground that anything `fixed` inside it is
 * measured from — the list would be placed from the corner of the bar
 * instead of the corner of the window, and land nowhere near its button.
 */
export default function CellMenu({ anchor, groups, onPlace }) {
  const [place, setPlace] = useState(null)
  // The button the group list hangs off, which is also what says it is open.
  const [listing, setListing] = useState(null)

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

  if (!place) return null

  return (
    <div
      className="cell-menu"
      style={{
        left: `${place.x}px`,
        top: `${place.y}px`,
        transform: `translate(-50%, ${place.below ? '0' : '-100%'})`,
      }}
      role="group"
      aria-label="This position"
    >
      <button
        type="button"
        className={`cell-menu-button${listing ? ' is-open' : ''}`}
        title="Play a group here"
        aria-label="Play a group here"
        aria-expanded={Boolean(listing)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => setListing(listing ? null : event.currentTarget)}
      >
        <ImportIcon />
      </button>

      {listing &&
        createPortal(
          <Popover
            anchor={listing}
            className="group-list"
            label="Groups on this sheet"
            onClose={() => setListing(null)}
          >
            {groups.length === 0 ? (
              <p className="group-list-empty">
                Nothing to play yet — a group has to be written somewhere before it
                can be played here.
              </p>
            ) : (
              groups.map((group) => (
                <button
                  key={`${group.row}:${group.start}`}
                  type="button"
                  className="group-list-item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPlace(group.name)
                    setListing(null)
                  }}
                >
                  <span className="group-list-name">{group.name}</span>
                  <span className="group-list-where">
                    Row {group.row + 1}, position {group.start + 1}
                  </span>
                </button>
              ))
            )}
          </Popover>,
          document.body,
        )}
    </div>
  )
}
