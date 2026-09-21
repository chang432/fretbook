import { useState } from 'react'
import Popover from './Popover.jsx'
import { MAX_GROUP_REPEAT, MIN_GROUP_SLOTS } from '../utils/tab.js'

/**
 * The list of groups a slot can be given, under the slot it was opened from,
 * and — once one has been chosen — how many times over it is played there.
 */
function GroupPicker({ anchor, groups, current, repeat, onPick, onSetRepeat, onClose }) {
  return (
    <Popover anchor={anchor} className="group-picker" label="Choose a group" onClose={onClose}>
      <div className="group-picker-section">
        <span className="group-picker-title">Group</span>
        <div className="group-picker-options">
          {/* The ids rows actually carry, in the order the rows stand in —
              which need not be 1, 2, 3 once rows have been reordered or
              removed. */}
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={`group-option${current === group ? ' is-active' : ''}`}
              aria-pressed={current === group}
              onClick={() => onPick(group)}
            >
              {group + 1}
            </button>
          ))}
          {current !== null && (
            <button
              type="button"
              className="group-option group-option--clear"
              onClick={() => onPick(null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Nothing to play twice until a group has been chosen, so the count
          only appears once there is one. */}
      {current !== null && (
        <div className="group-picker-section">
          <span className="group-picker-title">Repeat</span>
          <div className="group-picker-options">
            {Array.from({ length: MAX_GROUP_REPEAT }, (_, index) => index + 1).map((times) => (
              <button
                key={times}
                type="button"
                className={`group-option${repeat === times ? ' is-active' : ''}`}
                aria-pressed={repeat === times}
                aria-label={times === 1 ? 'Play once' : `Play ${times} times`}
                onClick={() => onSetRepeat(times)}
              >
                x{times}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}

/**
 * The running order, above the staves: one slot per position in the song,
 * each naming the row played there and how many times over. Rows are the
 * groups — writing 1, 2, 1 here says to play the first row, then the second,
 * then the first again, and a slot reading 1x3 plays that row three times
 * before the next slot begins.
 *
 * In edit mode a press reorders the strip instead of writing in it: the slot
 * picked up and the next one pressed exchange places. Which slot is held is
 * kept by the editor rather than here, since a row and a slot are the same
 * gesture and only one of them can be held at a time.
 */
export default function GroupSection({
  structure,
  groups,
  onSetGroup,
  onSetRepeat,
  editing,
  selectedSlot,
  onChooseSlot,
  onDropSelection,
}) {
  // The slot whose list is open, carrying its element so the list can anchor
  // to it without reaching back into the DOM.
  const [open, setOpen] = useState(null)

  // The picker belongs to writing the running order, not to reordering it, so
  // it is put away as the mode comes on rather than left hanging over a strip
  // that no longer answers it.
  const [wasEditing, setWasEditing] = useState(editing)
  if (wasEditing !== editing) {
    setWasEditing(editing)
    setOpen(null)
  }

  // Always one free slot past the end, and never so few that the strip reads
  // as an accident rather than somewhere to write.
  const slots = Math.max(MIN_GROUP_SLOTS, structure.length + 1)

  const close = () => setOpen(null)

  return (
    <div className="group-section" role="group" aria-label="Song structure">
      <span className="group-title">Groups</span>

      <div className="group-slots">
        {Array.from({ length: slots }, (_, slot) => {
          const entry = structure[slot] ?? null
          const held = editing && selectedSlot === slot
          // What this slot holds, for whichever of the two labels needs it.
          const contents =
            entry === null
              ? 'empty'
              : `group ${entry.group + 1}` +
                (entry.repeat > 1 ? ` played ${entry.repeat} times` : '')

          return (
            <button
              key={slot}
              type="button"
              className={[
                'group-slot',
                entry === null ? '' : 'is-filled',
                open?.slot === slot ? 'is-open' : '',
                held ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={editing ? held : undefined}
              aria-label={
                editing
                  ? selectedSlot === null || held
                    ? `Position ${slot + 1}, ${contents}`
                    : `Swap position ${slot + 1} with position ${selectedSlot + 1}`
                  : entry === null
                    ? `Position ${slot + 1}, empty — choose a group`
                    : `Position ${slot + 1}, ${contents}`
              }
              title={
                editing
                  ? selectedSlot === null
                    ? 'Pick this position up, then press another to swap the two'
                    : held
                      ? 'Put this position back down'
                      : `Swap this position with position ${selectedSlot + 1}`
                  : undefined
              }
              aria-haspopup={editing ? undefined : 'dialog'}
              aria-expanded={editing ? undefined : open?.slot === slot}
              onKeyDown={editing ? onDropSelection : undefined}
              onClick={(event) =>
                editing
                  ? onChooseSlot(slot)
                  : setOpen(open?.slot === slot ? null : { slot, element: event.currentTarget })
              }
            >
              {entry === null ? '' : entry.group + 1}
              {/* Once through is the ordinary case and says nothing worth the
                  room, so only a real repeat is written out. */}
              {entry !== null && entry.repeat > 1 && (
                <span className="group-repeat">x{entry.repeat}</span>
              )}
            </button>
          )
        })}
      </div>

      {!editing && open && (
        <GroupPicker
          anchor={open.element}
          groups={groups}
          current={structure[open.slot]?.group ?? null}
          repeat={structure[open.slot]?.repeat ?? 1}
          onPick={(group) => {
            onSetGroup(open.slot, group)
            close()
          }}
          onSetRepeat={(times) => {
            onSetRepeat(open.slot, times)
            close()
          }}
          onClose={close}
        />
      )}
    </div>
  )
}
