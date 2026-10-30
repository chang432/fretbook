import { useState } from 'react'
import { MAX_MEMO } from '../utils/tab.js'

/**
 * The sheet's written note, above the running order: a paragraph for what the
 * staves cannot say — a tuning, a capo, who it is by, what to listen for.
 *
 * It is folded away by default, since an empty box at the top of every sheet
 * would stand between the reader and the writing it is there to support. A
 * sheet that already carries a note opens with it in view, and a folded one
 * says its first line in the heading, so a note is never quietly lost behind
 * a word the reader has no reason to press.
 */
export default function MemoSection({ memo, onChange }) {
  const [open, setOpen] = useState(() => memo !== '')
  // Whether the cursor should land in the box as it appears. It should when
  // the heading was pressed to open it, and not when a sheet simply arrived
  // with a note already on it — that is being read, not written in.
  const [takeCursor, setTakeCursor] = useState(false)

  // A note arriving from outside — a file opened, an undo putting one back —
  // unfolds the section rather than sitting behind a closed heading. Adjusted
  // as the note changes rather than in an effect: it is state that has gone
  // stale, not a subscription to anything outside React.
  const [was, setWas] = useState(memo)
  if (was !== memo) {
    setWas(memo)
    if (memo && !open) setOpen(true)
  }

  // What is folded away, in one line: where a reader puts the thing worth
  // seeing first.
  const firstLine = memo.trim().split('\n')[0]

  const toggle = () => {
    setTakeCursor(!open)
    setOpen(!open)
  }

  return (
    <div className="memo-section">
      <button
        type="button"
        className="memo-toggle"
        aria-expanded={open}
        onClick={toggle}
        title={open ? 'Fold the note away' : 'Write a note about this sheet'}
      >
        <span className={`memo-caret${open ? ' is-open' : ''}`} aria-hidden="true">
          ›
        </span>
        <span className="memo-heading">Notes</span>
        {!open && firstLine && <span className="memo-preview">{firstLine}</span>}
      </button>

      {open && (
        <textarea
          className="memo-input"
          value={memo}
          maxLength={MAX_MEMO}
          rows={3}
          spellCheck
          placeholder="Tuning, capo, what to listen for…"
          aria-label="Notes about this sheet"
          autoFocus={takeCursor}
          onChange={(event) => onChange(event.target.value)}
          // The note is kept as it is typed, so escape only folds it away —
          // the same way out the shift arrows and the pickers offer.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.currentTarget.blur()
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
