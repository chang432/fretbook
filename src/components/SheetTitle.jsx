import { useState } from 'react'
import { PencilIcon } from './icons.jsx'
import { TITLE_LIMIT, typeSheetName } from '../utils/files.js'

/**
 * The sheet's title, read as text until the pencil beside it is pressed, then
 * written in a box. Enter or leaving the box keeps the change; Escape puts the
 * title back as it was.
 */
export default function SheetTitle({ title, onChange }) {
  const [editing, setEditing] = useState(false)
  const [before, setBefore] = useState(title)

  const startEditing = () => {
    setBefore(title)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="sheet-title">
        <input
          className="title-input"
          value={title}
          onChange={(event) => onChange(typeSheetName(event.target.value))}
          onBlur={() => setEditing(false)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setEditing(false)
            if (event.key === 'Escape') {
              onChange(before)
              setEditing(false)
            }
          }}
          maxLength={TITLE_LIMIT}
          autoFocus
          autoCapitalize="off"
          placeholder="Untitled"
          aria-label="Title"
        />
      </div>
    )
  }

  return (
    <div className="sheet-title">
      <span className={`sheet-title-text${title.trim() ? '' : ' is-empty'}`}>{title.trim() || 'Untitled'}</span>
      <button type="button" className="icon-button sheet-title-edit" onClick={startEditing} aria-label="Edit title" title="Edit title">
        <PencilIcon />
      </button>
    </div>
  )
}
