import { useEffect, useState } from 'react'
import Popover from './Popover.jsx'
import { fetchManifest, fetchNote } from '../utils/notes.js'

/** Browse and open saved sheets without leaving the editor. */
export default function NoteIndex({ anchor, onClose, onOpen, onDraft, hasPublished }) {
  const [notes, setNotes] = useState(null)
  const [opening, setOpening] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchManifest().then((list) => {
      if (active) setNotes(list)
    })
    return () => { active = false }
  }, [])

  const open = async (slug) => {
    setOpening(slug)
    setError('')
    const sheet = await fetchNote(slug)
    if (sheet) onOpen({ slug, sheet })
    else {
      setOpening(null)
      setError(`Could not open “${slug}”. It may no longer be available.`)
    }
  }

  return (
    <Popover anchor={anchor} className="sheet-picker" label="Saved sheets" onClose={onClose} centered>
      <h2>Saved sheets</h2>
      {hasPublished && <button type="button" onClick={onDraft}>Open my draft</button>}
      {notes === null && <p className="note-shell-text">Loading…</p>}
      {notes?.length === 0 && <p className="note-shell-text">No saved sheets yet.</p>}
      {notes?.length > 0 && (
        <ul className="note-list">
          {notes.map(({ slug, title }) => (
            <li key={slug}>
              <button type="button" className="note-list-link" disabled={!!opening} onClick={() => open(slug)}>
                <span className="note-list-title">{title || slug}</span>
                <span className="note-list-slug">{opening === slug ? 'Opening…' : slug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="publish-error" role="alert">{error}</p>}
    </Popover>
  )
}
