import { useEffect, useState } from 'react'
import NoteLink from './NoteLink.jsx'
import { notePath } from '../utils/route.js'
import { fetchManifest, notesConfigured } from '../utils/notes.js'

/**
 * The published notes, listed. The list is notes.json in this environment's
 * bucket, rewritten whenever a note is published — so the page is current
 * without the site being rebuilt.
 */
export default function NoteIndex() {
  const [notes, setNotes] = useState(null)

  useEffect(() => {
    let ignore = false
    fetchManifest().then((list) => {
      if (!ignore) setNotes(list)
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

      {/* A build with no bucket behind it has nothing to list and no way to
          find out, which is a different thing from nothing being published. */}
      {!notesConfigured && (
        <p className="note-shell-text">
          This build was not told where the notes are (VITE_NOTES_BASE_URL).
        </p>
      )}

      {notesConfigured && notes === null && <p className="note-shell-text">Loading…</p>}

      {notesConfigured && notes?.length === 0 && (
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
