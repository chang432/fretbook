import ActionBar from './ActionBar.jsx'
import { TrashIcon } from './icons.jsx'

/**
 * The one button that takes something off the sheet, over the thing it
 * would take: a group held open, or one place that group is played.
 *
 * What goes and what stays is the model's business — see `deleteGroup` and
 * `deleteRef` in utils/tabV2.js. All this knows is that it is the only way
 * to ask, and `title` is where it says in plain words what will happen, since
 * deleting a group reaches further than the group itself.
 *
 * The press is turned away first so that what is being deleted does not lose
 * the focus — and with it itself — before the press lands.
 */
export default function DeleteBar({ anchor, label, title, onDelete }) {
  return (
    <ActionBar anchor={anchor} label={label}>
      <button
        type="button"
        className="action-bar-button"
        title={title}
        aria-label={title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onDelete}
      >
        <TrashIcon />
      </button>
    </ActionBar>
  )
}
