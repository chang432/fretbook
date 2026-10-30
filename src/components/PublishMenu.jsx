import { useEffect, useRef, useState } from 'react'
import NoteLink from './NoteLink.jsx'
import Popover from './Popover.jsx'
import { NOTE_NAME } from '../utils/tab.js'
import { notePath } from '../utils/route.js'

/**
 * The panel the Publish button opens: a name, and the press that uploads the
 * sheet to the bucket under it.
 *
 * The name is the URL, so it is the one thing asked for — prefilled from the
 * title, which `slugify` already shapes into a publishable name. It is checked
 * against NOTE_NAME here as well as in the backend, so a name that cannot work
 * is said so before an upload rather than after one.
 *
 * Publishing is final in both directions: a published note cannot be changed
 * or taken down from the browser, and a name that is taken is refused rather
 * than written over (R2 keeps no versions — see docs/notes-upload-from-app.md).
 * So the panel stays open afterwards, holding the link, rather than closing on
 * the one action here that cannot be repeated or undone.
 */
export default function PublishMenu({ anchor, defaultSlug, onClose, onPublish }) {
  const [name, setName] = useState(defaultSlug)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The note once it is up, which is also what turns this panel into a
  // receipt: there is nothing more to do to it from here.
  const [published, setPublished] = useState(null)
  // Counts the refusals that were about the name, rather than holding whether
  // the last one was: two in a row have to be told apart, since answering the
  // second is the same thing as answering the first.
  const [nameRefused, setNameRefused] = useState(0)
  const field = useRef(null)

  // A taken name is the one refusal the reader answers by typing: the sheet
  // and the press were both fine, and only the name has to change. So it is
  // handed back selected, ready to be typed over. Done from an effect because
  // the field is disabled while the upload is in flight, and a disabled input
  // cannot take focus — this runs after the render that enables it again.
  useEffect(() => {
    if (nameRefused) field.current?.select()
  }, [nameRefused])

  const slug = name.trim()
  const named = NOTE_NAME.test(slug)

  const submit = async (event) => {
    event.preventDefault()
    if (busy || !named) return

    setBusy(true)
    setError('')
    const result = await onPublish(slug)
    setBusy(false)

    if (result.ok) {
      setPublished(result.note ?? { slug })
      return
    }

    setError(result.error)
    if (result.taken) setNameRefused((count) => count + 1)
  }

  if (published) {
    return (
      <Popover anchor={anchor} className="publish-menu" label="Published" onClose={onClose}>
        <p className="publish-done">Published.</p>
        <NoteLink to={notePath(published.slug)} className="link-inline">
          Open /notes/{published.slug}
        </NoteLink>
        <p className="publish-hint">
          It is live now, and it is the bucket&rsquo;s copy from here on — nothing in
          this browser can change it or take it down.
        </p>
      </Popover>
    )
  }

  return (
    <Popover anchor={anchor} className="publish-menu" label="Publish" onClose={onClose}>
      <form onSubmit={submit}>
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
              // The reason is the name that was sent, so it stops applying the
              // moment the name changes.
              setError('')
            }}
            disabled={busy}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>

        {/* The rule in words, since a name that breaks it is caught before the
            upload and the field cannot say why on its own. */}
        <p className="publish-hint">
          Lowercase letters and digits, joined by single dashes or underscores.
        </p>

        <button type="submit" disabled={busy || !named}>
          {busy ? 'Publishing…' : 'Publish'}
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
