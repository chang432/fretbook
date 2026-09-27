import { useEffect, useState } from 'react'
import App from '../App.jsx'
import NoteLink from './NoteLink.jsx'
import { NOTES_PATH, noteFile } from '../utils/route.js'
import { fromJson } from '../utils/tab.js'

/**
 * One published note, read from the JSON file of the same name on the server.
 * That file is the note: there is nothing behind it to write to, and nothing
 * the reader does here is sent anywhere.
 */
export default function NotePage({ slug }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    // StrictMode runs this twice in development, so a first answer must not
    // land on top of a second.
    let ignore = false

    fetch(noteFile(slug))
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (ignore) return
        // A name with no file behind it can still answer 200: the server sends
        // index.html for anything it does not recognise so a deep link works.
        // So the parse is the test of whether this note exists, not the status.
        const sheet = text === null ? null : fromJson(text)
        setState(sheet ? { status: 'ready', sheet } : { status: 'missing' })
      })
      .catch(() => {
        if (!ignore) setState({ status: 'missing' })
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
          It may have been renamed, or the link may have picked up a stray character.
        </p>
        <NoteLink to={NOTES_PATH} className="link-inline">
          See the published notes
        </NoteLink>
      </div>
    )
  }

  return <App published={{ slug, sheet: state.sheet }} />
}
