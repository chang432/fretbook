import { useEffect, useRef, useState } from 'react'
import NoteLink from './NoteLink.jsx'
import Popover from './Popover.jsx'
import { NOTE_NAME } from '../utils/tab.js'
import { notePath } from '../utils/route.js'

/**
 * The panel behind the two buttons that write to the bucket. Which one it is
 * follows from `note`:
 *
 *   no note   Publish — a name, and the press that uploads the sheet under it
 *   a note    Update  — that note's name, fixed, and the password to write
 *                       over it with
 *
 * One panel rather than two because the shape is the same — one field, one
 * press, one receipt — and only what is asked for and what it costs differ.
 *
 * Publishing asks for the name because the name is the URL. It is prefilled
 * from the title, which `slugify` already shapes into a publishable name, and
 * checked against NOTE_NAME here as well as in the backend, so a name that
 * cannot work is said so before an upload rather than after one.
 *
 * Updating asks for the password because it is the one press here that
 * destroys something: R2 keeps no versions, and the note it writes over is the
 * only copy there was (docs/notes-upload-from-app.md). The password is typed
 * for that press and kept nowhere — not in storage, not between panels.
 *
 * Either way the panel stays open afterwards, holding the link, rather than
 * closing on an action that cannot be repeated or undone.
 */
export default function PublishMenu({ anchor, note = null, defaultSlug = '', onClose, onWrite }) {
  const updating = note !== null

  const [name, setName] = useState(defaultSlug)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The note once it is written, which is also what turns this panel into a
  // receipt: there is nothing more to do to it from here.
  const [written, setWritten] = useState(null)
  // Counts the refusals that were about what is in the field — a name already
  // taken, a password that was not right — rather than holding whether the
  // last one was: two in a row have to be told apart, since answering the
  // second is the same thing as answering the first.
  const [refused, setRefused] = useState(0)
  const field = useRef(null)

  // Those refusals are the ones the reader answers by typing, so the field is
  // handed back selected, ready to be typed over. Done from an effect because
  // the field is disabled while the write is in flight, and a disabled input
  // cannot take focus — this runs after the render that enables it again.
  useEffect(() => {
    if (refused) field.current?.select()
  }, [refused])

  const slug = updating ? note : name.trim()
  const ready = updating ? password !== '' : NOTE_NAME.test(slug)

  const submit = async (event) => {
    event.preventDefault()
    if (busy || !ready) return

    setBusy(true)
    setError('')
    const result = await onWrite(slug, password)
    setBusy(false)

    if (result.ok) {
      setWritten(result.note ?? { slug })
      return
    }

    setError(result.error)
    if (result.taken || result.wrongPassword) setRefused((count) => count + 1)
  }

  if (written) {
    return (
      <Popover
        anchor={anchor}
        className="publish-menu"
        label={updating ? 'Updated' : 'Published'}
        onClose={onClose}
      >
        <p className="publish-done">{updating ? 'Updated.' : 'Published.'}</p>
        <NoteLink to={notePath(written.slug)} className="link-inline">
          Open /notes/{written.slug}
        </NoteLink>
        <p className="publish-hint">
          {updating
            ? 'The note is this sheet now. What was there before it is gone.'
            : 'It is live now, and it is the bucket’s copy from here on — nothing in this browser can change it or take it down.'}
        </p>
      </Popover>
    )
  }

  return (
    <Popover
      anchor={anchor}
      className="publish-menu"
      label={updating ? 'Update' : 'Publish'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {updating ? (
          <>
            <label className="publish-label" htmlFor="publish-password">
              Password, to write over /notes/{slug}
            </label>
            <div className="publish-field">
              <input
                ref={field}
                id="publish-password"
                className="publish-input"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  // The reason was about what was sent, so it stops applying
                  // the moment that changes.
                  setError('')
                }}
                disabled={busy}
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {/* Said before the press rather than after it: there is no
                version to go back to, and no second copy anywhere. */}
            <p className="publish-hint">
              This replaces the published note. There are no versions to go back
              to.
            </p>
          </>
        ) : (
          <>
            <label className="publish-label" htmlFor="publish-name">
              Publish as
            </label>
            <div className="publish-field">
              <span className="publish-prefix">/notes/</span>
              <input
                ref={field}
                id="publish-name"
                className="publish-input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError('')
                }}
                disabled={busy}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
              />
            </div>

            {/* The rule in words, since a name that breaks it is caught before
                the upload and the field cannot say why on its own. */}
            <p className="publish-hint">
              Lowercase letters and digits, joined by single dashes or
              underscores.
            </p>
          </>
        )}

        <button type="submit" className={updating ? 'danger' : ''} disabled={busy || !ready}>
          {busy ? (updating ? 'Updating…' : 'Publishing…') : updating ? 'Update' : 'Publish'}
        </button>

        {error && (
          <p className="publish-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Popover>
  )
}
