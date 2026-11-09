import { useState } from 'react'
import { createPortal } from 'react-dom'
import ActionBar from './ActionBar.jsx'
import Popover from './Popover.jsx'
import { AddColumnIcon, CrossIcon, GroupStartIcon, ImportIcon, RewindIcon } from './icons.jsx'

/**
 * The buttons that come up over the position being written in: copying
 * what was written at the position before, making room either side of it,
 * opening a new group here, playing a group written elsewhere here, and
 * taking the position off the row altogether.
 *
 * Some are offered only where they mean something — there is a position
 * before this one to copy, this one is somewhere a group can be put, which
 * nowhere inside another group is, and the row has a position to spare.
 * Room can always be made, so the bar always has something to show.
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
export default function CellMenu({
  anchor,
  groups,
  onPlace,
  canCopy,
  canPlace,
  onCopy,
  onOpenGroup,
  canDelete,
  onDeleteColumn,
  onInsertBefore,
  onInsertAfter,
  children,
}) {
  // The button the group list hangs off, which is also what says it is open.
  const [listing, setListing] = useState(null)

  return (
    <ActionBar anchor={anchor} label="This position">
      {children}
      {canCopy && <button type="button" className="action-bar-button" title="Copy previous position" aria-label="Copy previous position" onMouseDown={(event) => event.preventDefault()} onClick={onCopy}><RewindIcon width={20} height="14" /></button>}
      {/* Opening a group here. The button wears the mark it makes: the
          bar, and the two half-arrows that come off it. */}
      {canPlace && (
        <button
          type="button"
          className="action-bar-button"
          title="Start a new group here"
          aria-label="Start a new group here"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenGroup}
        >
          <GroupStartIcon />
        </button>
      )}

      {canPlace && (
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
      )}

      {/* Off the row altogether, with everything past it moving one
          closer. Last in the bar, being the one that takes away. */}
      {canDelete && (
        <button
          type="button"
          className="action-bar-button"
          title="Delete this position"
          aria-label="Delete this position"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDeleteColumn}
        >
          <CrossIcon />
        </button>
      )}

      {/* One more position either side of this one, at the end of the bar:
          these two make room rather than acting on what is here, and the
          carets point the way the row opens. */}
      <button
        type="button"
        className="action-bar-button"
        title="Add a position before this one"
        aria-label="Add a position before this one"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onInsertBefore}
      >
        <AddColumnIcon before />
      </button>

      <button
        type="button"
        className="action-bar-button"
        title="Add a position after this one"
        aria-label="Add a position after this one"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onInsertAfter}
      >
        <AddColumnIcon before={false} />
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
                  // Nothing but the letter is shown: a group is known by its
                  // name and by nothing else, so where it happens to be
                  // written is not what is being chosen between. The label
                  // says the rest, for anyone who cannot see the staff.
                  aria-label={`Play group ${group.name} here`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPlace(group.name)
                    setListing(null)
                  }}
                >
                  {group.name}
                </button>
              ))
            )}
          </Popover>,
          document.body,
        )}
    </ActionBar>
  )
}
