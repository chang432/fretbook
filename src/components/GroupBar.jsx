import { useRef, useState } from 'react'
import { MAX_GROUP_NAME } from '../utils/tab.js'

/**
 * The bar at the head of a group: one band across the full width of the
 * sheet, carrying what the group is called and how many rows stand under it.
 *
 * The bar is the only place a group is drawn — there is no strip of them
 * anywhere else — so its name is typed here in place, the way a row's name is
 * typed beside its number. What is half-typed belongs to the box it is typed
 * in, so the draft is the one thing this keeps; the name itself is the
 * sheet's, and goes back to it when the box closes.
 */
export default function GroupBar({ group, label, rows, editing, onRename }) {
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

  return (
    <div className="group-bar">
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
          only counts them — and says so plainly while there are none, since a
          bar over nothing would otherwise look like a mistake. */}
      <span className="group-bar-rows">
        {rows ? `${rows} row${rows === 1 ? '' : 's'}` : 'no rows yet'}
      </span>
    </div>
  )
}
