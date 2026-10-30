import { useState } from 'react'
import Popover from './Popover.jsx'
import { groupLabel } from '../utils/tab.js'

/**
 * The running order, under the sheet's note: the groups laid out left to
 * right in the order they are played, with an arrow between them — a verse,
 * a chorus, that verse again.
 *
 * It holds group ids rather than groups, so the same group can stand in it
 * twice, and a block is pressed off by where it stands rather than by what it
 * names. Nothing here is written anywhere else: adding a block to the order
 * does not touch the group it names, and taking one out leaves the group and
 * its rows exactly where they are.
 *
 * It folds like the note above it, and for the same reason: an empty strip at
 * the top of every sheet would stand between the reader and the staves. A
 * sheet that arrives already arranged opens with the order in view, and a
 * folded one says it in the heading, so an arrangement is never quietly lost
 * behind a word the reader has no reason to press.
 */
export default function ArrangementSection({
  groups,
  arrangement,
  tone,
  editing,
  onAdd,
  onRemove,
}) {
  const [open, setOpen] = useState(() => arrangement.length > 0)
  // The add block's element while the picker hangs under it.
  const [picking, setPicking] = useState(null)

  // An order arriving from outside — a file opened, an undo putting one back
  // — unfolds the section rather than sitting behind a closed heading.
  // Adjusted as it changes rather than in an effect: it is state that has
  // gone stale, not a subscription to anything outside React.
  const [was, setWas] = useState(arrangement)
  if (was !== arrangement) {
    setWas(arrangement)
    if (arrangement.length && !open) setOpen(true)
  }

  // What is folded away, in one line — the order itself, since that is the
  // thing worth seeing before deciding to open it.
  const summary = arrangement.map((id) => groupLabel(groups, id)).join(' → ')

  const arrow = <span className="arrangement-arrow" aria-hidden="true">→</span>

  return (
    <div className="arrangement-section">
      <button
        type="button"
        className="memo-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={open ? 'Fold the arrangement away' : 'Arrange the groups into a song'}
      >
        <span className={`memo-caret${open ? ' is-open' : ''}`} aria-hidden="true">
          ›
        </span>
        <span className="memo-heading">Arrangement</span>
        {!open && summary && <span className="memo-preview">{summary}</span>}
      </button>

      {open && (
        <ol className="arrangement-list">
          {arrangement.map((groupId, at) => (
            // Keyed by place: a block is where it stands, and two blocks on
            // one group are two blocks.
            <li className="arrangement-step" key={at}>
              {at > 0 && arrow}
              <span className="arrangement-block" style={{ '--group': tone(groupId) }}>
                <span className="arrangement-name">{groupLabel(groups, groupId)}</span>
                {/* Takes this one block out. The group stays on the sheet, so
                    this goes on one press, the way a group's own × does. */}
                <button
                  type="button"
                  className="arrangement-remove"
                  disabled={editing}
                  onClick={() => onRemove(at)}
                  title={`Take ${groupLabel(groups, groupId)} out of the arrangement here`}
                  aria-label={`Take ${groupLabel(groups, groupId)} out of the arrangement, position ${at + 1}`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}

          {/* Where the order is extended: an outline of a block, dashed, the
              way somewhere to write is drawn rather than something written. */}
          <li className="arrangement-step" key="add">
            {arrangement.length > 0 && arrow}
            <button
              type="button"
              className="arrangement-add"
              disabled={editing}
              // Read straight off the press, the way the Export and Publish
              // buttons take their anchor: `currentTarget` is the element only
              // for as long as the handler runs.
              onClick={(event) => setPicking(picking ? null : event.currentTarget)}
              title="Add a group to the arrangement"
              aria-label="Add a group to the arrangement"
            >
              +
            </button>
          </li>
        </ol>
      )}

      {picking && (
        <Popover
          anchor={picking}
          className="arrangement-picker"
          label="Add a group to the arrangement"
          onClose={() => setPicking(null)}
        >
          {groups.length === 0 ? (
            <p className="arrangement-none">There are no groups on this sheet yet.</p>
          ) : (
            groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className="arrangement-option"
                style={{ '--group': tone(group.id) }}
                onClick={() => {
                  onAdd(group.id)
                  setPicking(null)
                }}
              >
                <span className="arrangement-swatch" aria-hidden="true" />
                {groupLabel(groups, group.id)}
              </button>
            ))
          )}
        </Popover>
      )}
    </div>
  )
}
