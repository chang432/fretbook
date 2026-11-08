import { useState } from 'react'
import { createPortal } from 'react-dom'
import ActionBar from './ActionBar.jsx'
import Popover from './Popover.jsx'
import { ImportIcon, RewindIcon } from './icons.jsx'

/**
 * The buttons that come up over the position being written in. One so far:
 * it opens the sheet's groups, and choosing one puts that group down here.
 *
 * The bar itself is ActionBar, which every one of these shares — where it
 * stands and how it follows its cell is that component's business.
 *
 * The list of groups is sent to the end of the document rather than drawn
 * inside the bar. The bar is centred over its cell with a transform, and a
 * transform makes its box the ground that anything `fixed` inside it is
 * measured from — the list would be placed from the corner of the bar
 * instead of the corner of the window, and land nowhere near its button.
 */
export default function CellMenu({ anchor, groups, onPlace, canCopy, onCopy }) {
  // The button the group list hangs off, which is also what says it is open.
  const [listing, setListing] = useState(null)

  return (
    <ActionBar anchor={anchor} label="This position">
      {canCopy && <button type="button" className="action-bar-button" title="Copy previous position" aria-label="Copy previous position" onMouseDown={(event) => event.preventDefault()} onClick={onCopy}><RewindIcon width={20} height="14" /></button>}
      <button
        type="button"
        className={`action-bar-button${listing ? ' is-open' : ''}`}
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
    </ActionBar>
  )
}
