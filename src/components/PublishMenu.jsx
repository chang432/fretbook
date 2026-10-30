import { useEffect, useRef, useState } from 'react'
import NoteLink from './NoteLink.jsx'
import Popover from './Popover.jsx'
import { NOTE_NAME } from '../utils/tab.js'
import { NOTES_PATH, notePath } from '../utils/route.js'

/**
 * What each of the three presses asks for and says. Kept as a table rather
 * than as branches in the markup below: the panel is one shape — one field,
 * one press, one receipt — and what differs between the three is wording.
 *
 * `asks` is the only structural difference. Publishing wants the name, because
 * the name is the URL; the other two want the password, because they are the
 * two that destroy something.
 */
const MODES = {
  publish: {
    label: 'Publish',
    busy: 'Publishing…',
    done: 'Published.',
    asks: 'name',
    danger: false,
    after:
      'It is live now, and it is the bucket’s copy from here on — nothing in ' +
      'this browser can change it or take it down.',
  },
  update: {
    label: 'Update',
    busy: 'Updating…',
    done: 'Updated.',
    asks: 'password',
    danger: true,
    warning: 'This replaces the published note. There are no versions to go back to.',
    after: 'The note is this sheet now. What was there before it is gone.',
  },
  delete: {
    label: 'Delete',
    busy: 'Deleting…',
    done: 'Deleted.',
    asks: 'password',
    danger: true,
    warning:
      'This takes the note down for good. Nothing else holds a copy of it, ' +
      'and the link stops working.',
    after: 'It is gone, and so is its line in the index.',
  },
}

/**
 * The panel behind the buttons that write to the bucket — Publish in the
 * editor, Update and Delete on a published note.
 *
 * Publishing asks for the name because the name is the URL. It is prefilled
 * from the title, which `slugify` already shapes into a publishable name, and
 * checked against NOTE_NAME here as well as in the backend, so a name that
 * cannot work is said so before an upload rather than after one.
 *
 * Updating and deleting ask for the password because they are the two presses
 * that destroy something: R2 keeps no versions, and the note either of them
 * acts on is the only copy there was (docs/notes-upload-from-app.md). The
 * password is typed for the press that uses it and kept nowhere — not in
 * storage, not between panels.
 *
 * Either way the panel stays open afterwards, holding what the press left
 * behind, rather than closing on an action that cannot be repeated or undone.
 */
export default function PublishMenu({
  anchor,
  mode = 'publish',
  note = null,
  defaultSlug = '',
  onClose,
  onWrite,
}) {
  const words = MODES[mode]
  const asksPassword = words.asks === 'password'

  const [name, setName] = useState(defaultSlug)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The note once the press has landed, which is also what turns this panel
  // into a receipt: there is nothing more to do to it from here.
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

  const slug = asksPassword ? note : name.trim()
  const ready = asksPassword ? password !== '' : NOTE_NAME.test(slug)

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
      <Popover anchor={anchor} className="publish-menu" label={words.done} onClose={onClose}>
        <p className="publish-done">{words.done}</p>
        {/* A note that is gone has nowhere of its own left to go, so that
            receipt points at the shelf it has just left instead. */}
        {mode === 'delete' ? (
          <NoteLink to={NOTES_PATH} className="link-inline">
            See the published notes
          </NoteLink>
        ) : (
          <NoteLink to={notePath(written.slug)} className="link-inline">
            Open /notes/{written.slug}
          </NoteLink>
        )}
        <p className="publish-hint">{words.after}</p>
      </Popover>
    )
  }

  return (
    <Popover anchor={anchor} className="publish-menu" label={words.label} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="publish-label" htmlFor={asksPassword ? 'publish-password' : 'publish-name'}>
          {asksPassword ? `Password, for /notes/${slug}` : 'Publish as'}
        </label>

        <div className="publish-field">
          {!asksPassword && <span className="publish-prefix">/notes/</span>}
          <input
            ref={field}
            id={asksPassword ? 'publish-password' : 'publish-name'}
            className="publish-input"
            type={asksPassword ? 'password' : 'text'}
            value={asksPassword ? password : name}
            onChange={(event) => {
              if (asksPassword) setPassword(event.target.value)
              else setName(event.target.value)
              // The reason was about what was sent, so it stops applying the
              // moment that changes.
              setError('')
            }}
            disabled={busy}
            autoFocus
            autoComplete={asksPassword ? 'current-password' : 'off'}
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>

        {/* Said before the press rather than after it: what the two dangerous
            ones do cannot be undone, and the rule a name has to keep is caught
            before an upload, where the field cannot say why on its own. */}
        <p className="publish-hint">
          {words.warning ??
            'Lowercase letters and digits, joined by single dashes or underscores.'}
        </p>

        <button type="submit" className={words.danger ? 'danger' : ''} disabled={busy || !ready}>
          {busy ? words.busy : words.label}
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
