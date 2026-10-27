/**
 * The undo stack.
 *
 * An entry is a snapshot of the editor as it stood *before* one action, taken
 * by whichever handler is about to change it: `{ label, token, state }`, where
 * `state` holds the pieces that action touches and `label` is prose for the
 * line that says what was undone. Nothing here knows how to apply a snapshot —
 * that is the editor's job, and it is the same job as applying any other
 * change to the sheet.
 *
 * The stack is bounded, so the oldest snapshot falls off the front once it is
 * full. Undo is therefore a short way back, not a record of the session, which
 * is why a run of keystrokes in one cell has to count as one step rather than
 * as five.
 */

/** How many actions back the Undo button can reach. */
export const HISTORY_LIMIT = 5

/**
 * Put a snapshot on the stack, dropping the oldest when it is full.
 *
 * `token` names the thing being edited for the actions that come in runs —
 * typing a fret is one keystroke at a time, but a reader who types "12" and
 * undoes means to clear the cell, not to go back to "1". A snapshot whose
 * token repeats the one on top is therefore dropped: the snapshot already up
 * there holds the sheet as it stood before the run started, which is where
 * undo belongs. Actions that stand alone pass no token and always push.
 */
export function pushHistory(stack, entry, limit = HISTORY_LIMIT) {
  const top = stack[stack.length - 1]
  if (entry.token && top && top.token === entry.token) return stack

  const next = [...stack, entry]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/**
 * Take the newest snapshot off. Returns the shortened stack and the entry to
 * apply, or a null entry when there is nothing left to undo, so a caller can
 * do both in one step without having to check the length first.
 */
export function popHistory(stack) {
  if (stack.length === 0) return { stack, entry: null }
  return { stack: stack.slice(0, -1), entry: stack[stack.length - 1] }
}

/** What the newest snapshot would undo, for the button's tooltip. */
export function nextUndoLabel(stack) {
  return stack[stack.length - 1]?.label ?? null
}
