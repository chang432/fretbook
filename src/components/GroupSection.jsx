import { useRef, useState } from 'react'
import Popover from './Popover.jsx'
import { MAX_GROUP_NAME, groupLabel, groupOfRow, rowName, rowsInGroup } from '../utils/tab.js'

/**
 * The groups a sheet holds, above the staves: one chip each, saying what the
 * group is called, which rows are in it, and opening the list of the sheet's
 * rows to say which of them belong to it. The button past the last chip adds
 * another group.
 *
 * A group is a collection of rows, and which rows it holds is kept against
 * the rows themselves — `members` in tab.js, keyed by row id — so this reads
 * membership off the sheet rather than keeping any of its own. What it does
 * keep is the half-typed name, which belongs to the box it is typed in.
 */
export default function GroupSection({
  groups,
  members,
  rowIds,
  names,
  editing,
  onAddGroup,
  onRenameGroup,
  onSetRowGroup,
}) {
  // The group whose name is being typed, and what has been typed so far.
  const [naming, setNaming] = useState(null)
  const [draft, setDraft] = useState('')
  // The group whose rows are being chosen, carrying the button the list hangs
  // under. Null when no list is open; only ever one at a time.
  const [picking, setPicking] = useState(null)
  // Set by Escape, so the blur it causes closes the box instead of writing
  // down what was abandoned in it — the bargain a row's name makes too.
  const abandoning = useRef(false)

  const startNaming = (group) => {
    setNaming(group.id)
    setDraft(group.name)
  }

  const finishNaming = (groupId) => {
    setNaming(null)
    if (abandoning.current) {
      abandoning.current = false
      return
    }
    onRenameGroup(groupId, draft)
  }

  return (
    <div className="group-section" role="group" aria-label="Groups">
      <span className="group-title">Groups</span>

      <div className="group-list">
        {groups.map((group, index) => {
          const held = rowsInGroup(members, rowIds, group.id)
          // A group nobody has named still answers to where it stands, so
          // there is always something to call it in a button or a sentence.
          const label = group.name || `Group ${index + 1}`

          return (
            <div className="group-chip" key={group.id}>
              {naming === group.id ? (
                <input
                  className="group-name-input"
                  value={draft}
                  autoFocus
                  maxLength={MAX_GROUP_NAME}
                  placeholder={`Group ${index + 1}`}
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
                  onBlur={() => finishNaming(group.id)}
                />
              ) : (
                <button
                  type="button"
                  className="group-name"
                  disabled={editing}
                  onClick={() => startNaming(group)}
                  title={group.name ? 'Rename this group' : 'Name this group'}
                >
                  {label}
                </button>
              )}

              {/* What the group holds, by where those rows stand on the page.
                  A group is a collection and not a place, so its rows need be
                  neither next to each other nor in any particular order. */}
              <span className="group-rows">
                {held.length
                  ? `${held.length === 1 ? 'row' : 'rows'} ${held.map((row) => row + 1).join(', ')}`
                  : 'no rows yet'}
              </span>

              <button
                type="button"
                className="group-add-row"
                disabled={editing}
                aria-haspopup="dialog"
                aria-expanded={picking?.id === group.id}
                onClick={(event) =>
                  setPicking(
                    picking?.id === group.id
                      ? null
                      : { id: group.id, label, element: event.currentTarget },
                  )
                }
                title={`Choose which rows are in ${label}`}
              >
                + Row
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className="group-add"
          disabled={editing}
          onClick={onAddGroup}
          title="Add another group"
          aria-label="Add another group"
        >
          +
        </button>
      </div>

      {/* The sheet's rows, under the chip the list was opened from: the ones
          already in the group are filled in, and pressing one either puts it
          in the group or takes it out again. A row is in one group at most,
          so taking it from another is the same press — which is why what it
          would do is spelled out on each one rather than left to be guessed. */}
      {picking && (
        <Popover
          anchor={picking.element}
          className="group-picker"
          label={`Rows in ${picking.label}`}
          onClose={() => setPicking(null)}
        >
          <div className="group-picker-section">
            <span className="group-picker-title">Rows</span>
            <div className="group-picker-options">
              {rowIds.map((rowId, rowIndex) => {
                const was = groupOfRow(members, rowId)
                const inThis = was === picking.id
                const name = rowName(names, rowId)

                return (
                  <button
                    key={rowId}
                    type="button"
                    className={`group-option${inThis ? ' is-active' : ''}`}
                    aria-pressed={inThis}
                    title={
                      inThis
                        ? `Take row ${rowIndex + 1} out of ${picking.label}`
                        : was === null
                          ? `Add row ${rowIndex + 1} to ${picking.label}`
                          : `Move row ${rowIndex + 1} from ${groupLabel(groups, was)} to ${picking.label}`
                    }
                    onClick={() => onSetRowGroup(rowIndex, inThis ? null : picking.id)}
                  >
                    {rowIndex + 1}
                    {name && <span className="group-option-name">{name}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </Popover>
      )}
    </div>
  )
}
