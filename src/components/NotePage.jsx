import { useEffect, useState } from 'react'
import App from '../App.jsx'
import NoteLink from './NoteLink.jsx'
import { NOTES_PATH } from '../utils/route.js'
import { fetchNote } from '../utils/notes.js'

/**
 * One published note, read out of the bucket by name. That object is the note:
 * there is nothing behind it to write to, and nothing the reader does here is
 * sent anywhere.
 */
export default function NotePage({ slug }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    // StrictMode runs this twice in development, so a first answer must not
    // land on top of a second.
    let ignore = false

    fetchNote(slug).then((sheet) => {
      if (ignore) return
      setState(sheet ? { status: 'ready', sheet } : { status: 'missing' })
    })

    return () => {
      ignore = true
    }
  }, [slug])

  const title = state.sheet?.title
  useEffect(() => {
    if (!title) return undefined
    const previous = document.title
    document.title = `${title} · Fretboard Notebook`
    return () => {
      document.title = previous
    }
  }, [title])

  if (state.status === 'loading') {
    return (
      <div className="app note-shell">
        <p className="note-shell-text">Opening {slug}…</p>
      </div>
    )
  }

  if (state.status === 'missing') {
    return (
      <div className="app note-shell">
        <h1>No note called “{slug}”</h1>
        <p className="note-shell-text">
          It may have been unpublished or renamed, or the link may have picked up a
          stray character.
        </p>
        <NoteLink to={NOTES_PATH} className="link-inline">
          See the published notes
        </NoteLink>
      </div>
    )
  }

  return <App published={{ slug, sheet: state.sheet }} />
}
