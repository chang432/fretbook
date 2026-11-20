import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import Popover from './Popover.jsx'
import { fetchManifest } from '../utils/notes.js'
import { followSheetLink, sheetPath } from '../utils/route.js'

/** Browse saved sheets from the editor, or leave them for a blank one. */
export default function NoteIndex({ anchor, onClose, onOpen, onNew }) {
  const { isSignedIn, getToken } = useAuth()
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!isSignedIn) return undefined
    fetchManifest(getToken).then((list) => {
      if (active) setNotes(list)
    }).catch(() => { if (active) setError('Could not load your saved sheets.') })
    return () => { active = false }
  }, [isSignedIn, getToken])

  return (
    <Popover anchor={anchor} className="sheet-picker" label="Saved sheets" onClose={onClose} centered>
      <h2>Saved sheets</h2>
      {isSignedIn && !error && notes === null && <p className="note-shell-text">Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {notes?.length === 0 && <p className="note-shell-text">No saved sheets yet.</p>}
      {notes?.length > 0 && (
        <ul className="note-list">
          {notes.map(({ slug }) => (
            <li key={slug}>
              <a href={sheetPath(slug)} className="note-list-link" onClick={(event) => followSheetLink(event, onOpen, slug)}>
                <span className="note-list-slug">{slug}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="note-list-new" onClick={onNew}>
        + New sheet
      </button>
    </Popover>
  )
}
