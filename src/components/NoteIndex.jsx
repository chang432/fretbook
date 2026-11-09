import { useEffect, useState } from 'react'
import Popover from './Popover.jsx'
import { fetchManifest } from '../utils/notes.js'
import { followSheetLink, sheetPath } from '../utils/route.js'

/** Browse saved sheets from the editor. */
export default function NoteIndex({ anchor, onClose, onOpen }) {
  const [notes, setNotes] = useState(null)

  useEffect(() => {
    let active = true
    fetchManifest().then((list) => {
      if (active) setNotes(list)
    })
    return () => { active = false }
  }, [])

  return (
    <Popover anchor={anchor} className="sheet-picker" label="Saved sheets" onClose={onClose} centered>
      <h2>Saved sheets</h2>
      {notes === null && <p className="note-shell-text">Loading…</p>}
      {notes?.length === 0 && <p className="note-shell-text">No saved sheets yet.</p>}
      {notes?.length > 0 && (
        <ul className="note-list">
          {notes.map(({ slug, title }) => (
            <li key={slug}>
              <a href={sheetPath(slug)} className="note-list-link" onClick={(event) => followSheetLink(event, onOpen, slug)}>
                <span className="note-list-title">{title || slug}</span>
                <span className="note-list-slug">{slug}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}
