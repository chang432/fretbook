import { useRef, useState } from 'react'
import { MAX_GROUP_NAME } from '../utils/tab.js'

/**
 * The bar at the head of a group: one band across the full width of the
 * sheet, carrying what the group is called, how many rows stand under it, the
 * caret that folds those rows away, and the × that takes the group off the
 * sheet.
 *
 * The bar is the only place a group is drawn — there is no strip of them
 * anywhere else — so its name is typed here in place, the way a row's name is
 * typed beside its number. What is half-typed belongs to the box it is typed
 * in, so the draft is the one thing this keeps; the name itself is the
 * sheet's, and goes back to it when the box closes.
 *
 * While edit mode holds a row, the bar stops being any of that and becomes
 * one thing to press: where the held row is sent. That is the only way a row
 * joins or leaves a group, so it is also why nothing else here takes a press
 * for as long as a row is being carried.
 */
export default function GroupBar({
  group,
  label,
  rows,
  bars,
  notes,
  folded,
  editing,
  holding,
  onRename,
  onToggleFold,
  onDelete,
  onDrop,
}) {
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  // Set by Escape, so the blur it causes closes the box instead of writing
  // down what was abandoned in it — the same bargain a row's name makes.
  const abandoning = useRef(false)

  const startNaming = () => {
    setDraft(group.name)
    setNaming(true)
  }

  const finishNaming = () => {
    setNaming(false)
    if (abandoning.current) {
      abandoning.current = false
      return
    }
    onRename(group.id, draft)
  }

  // Which way the press on the bar goes while a row is held: into the group,
  // or out of it when the row being carried is already one of its own.
  const takes = holding !== null && !holding.inGroup

  return (
    <div className="group-bar">
      {/* Folds the group's rows away and brings them back. A group is a way
          of putting part of a sheet aside, so it can be put aside whole. */}
      <button
        type="button"
        className="group-caret"
        aria-expanded={!folded}
        onClick={() => onToggleFold(group.id)}
        title={folded ? `Show the rows in ${label}` : `Fold ${label} away`}
        aria-label={folded ? `Show the rows in ${label}` : `Fold ${label} away`}
      >
        <span className={`group-caret-mark${folded ? '' : ' is-open'}`}>›</span>
      </button>

      {naming ? (
        <input
          className="group-bar-input"
          value={draft}
          autoFocus
          maxLength={MAX_GROUP_NAME}
          placeholder={label}
          aria-label={`Name of ${label}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              // Nothing else on the page acts on the same press.
              event.stopPropagation()
              abandoning.current = true
              event.currentTarget.blur()
            }
          }}
          onBlur={finishNaming}
        />
      ) : (
        <button
          type="button"
          className="group-bar-name"
          disabled={editing}
          onClick={startNaming}
          title={group.name ? 'Rename this group' : 'Name this group'}
        >
          {label}
        </button>
      )}

      {/* What the group holds. The rows are under the bar to be read, so this
          only counts them — until they are folded away, when it says what has
          been put aside, as a folded row says what is in it. */}
      <span className="group-bar-rows">
        {rows ? `${rows} row${rows === 1 ? '' : 's'}` : 'no rows yet'}
        {folded && rows > 0 && ` · ${bars} bar${bars === 1 ? '' : 's'}`}
        {folded && notes > 0 && ` · ${notes} note${notes === 1 ? '' : 's'}`}
      </span>

      {/* Takes the group off the sheet. The rows it holds are not touched, so
          this goes on one press and Undo is the way back — the same bargain
          the bin at the end of a row makes.

          Open in edit mode as well: a group that turned out to be the wrong
          way to divide the sheet is found while the sheet is being put in
          order, and because no row moves, nothing the mode is carrying goes
          stale. While a row is actually held the drop button below covers the
          whole bar, so the bar is one errand at a time either way. */}
      <button
        type="button"
        className="group-delete"
        onClick={() => onDelete(group.id)}
        title={
          rows
            ? `Delete ${label} — its rows stay, in no group`
            : `Delete ${label}`
        }
        aria-label={`Delete ${label}`}
      >
        ×
      </button>

      {/* While a row is held, the whole bar is where that row is sent. It is
          laid over everything above rather than replacing it, so the group
          being aimed at still reads as itself. */}
      {holding !== null && (
        <button
          type="button"
          className="group-drop"
          onClick={() => onDrop(group.id, takes)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur()
          }}
          title={
            takes
              ? `Put row ${holding.label} in ${label}`
              : `Take row ${holding.label} out of ${label}`
          }
          aria-label={
            takes
              ? `Put row ${holding.label} in ${label}`
              : `Take row ${holding.label} out of ${label}`
          }
        >
          <span className="group-drop-hint">{takes ? 'Put here' : 'Take out'}</span>
        </button>
      )}
    </div>
  )
}
