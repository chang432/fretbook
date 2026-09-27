import { useEffect, useState } from 'react'
import NoteLink from './NoteLink.jsx'
import { NOTES_MANIFEST, notePath } from '../utils/route.js'

/**
 * The published notes, listed. The list comes from notes.json, which is
 * written at build time from whatever is in public/notes/ — so publishing a
 * note is adding the file and nothing else.
 */
export default function NoteIndex() {
  const [notes, setNotes] = useState(null)

  useEffect(() => {
    let ignore = false
    fetch(NOTES_MANIFEST)
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => {
        if (!ignore) setNotes(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!ignore) setNotes([])
      })
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="app note-shell">
      <header className="header">
        <h1>Published notes</h1>
        <NoteLink to="/" className="link-inline">
          Open my sheet
        </NoteLink>
      </header>

      {notes === null && <p className="note-shell-text">Loading…</p>}

      {notes?.length === 0 && (
        <p className="note-shell-text">Nothing has been published yet.</p>
      )}

      {notes?.length > 0 && (
        <ul className="note-list">
          {notes.map(({ slug, title }) => (
            <li key={slug}>
              <NoteLink to={notePath(slug)} className="note-list-link">
                <span className="note-list-title">{title || slug}</span>
                <span className="note-list-slug">/notes/{slug}</span>
              </NoteLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
