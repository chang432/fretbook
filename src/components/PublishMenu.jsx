import { useState } from 'react'
import Popover from './Popover.jsx'
import { NOTE_NAME } from '../utils/files.js'
import { followSheetLink, sheetPath } from '../utils/route.js'

const MODES = {
  publish: { label: 'Save', busy: 'Saving…', done: 'Saved.' },
  update: { label: 'Update', busy: 'Updating…', done: 'Updated.', warning: 'This replaces the saved sheet.' },
  delete: { label: 'Delete', busy: 'Deleting…', done: 'Deleted.', warning: 'This permanently deletes the saved sheet.' },
}

export default function PublishMenu({ anchor, mode = 'publish', note = null, defaultSlug = '', onClose, onWrite, onOpen }) {
  const words = MODES[mode]
  const [name, setName] = useState(defaultSlug)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [written, setWritten] = useState(null)
  const slug = mode === 'publish' ? name.trim() : note
  const ready = mode !== 'publish' || NOTE_NAME.test(slug)

  const submit = async (event) => {
    event.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError('')
    const result = await onWrite(slug)
    setBusy(false)
    if (result.ok) setWritten(result.note ?? { slug })
    else setError(result.error)
  }

  return (
    <Popover anchor={anchor} className="publish-menu" label={words.label} onClose={onClose}>
      {written ? (
        <>
          <p className="publish-done">{words.done}</p>
          {mode !== 'delete' && <a href={sheetPath(written.slug)} onClick={(event) => followSheetLink(event, onOpen, written.slug)}>Open saved sheet</a>}
        </>
      ) : (
        <form onSubmit={submit}>
          {mode === 'publish' && (
            <>
              <label className="publish-label" htmlFor="publish-name">Save as</label>
              <div className="publish-field">
                <input id="publish-name" className="publish-input" value={name} onChange={(event) => { setName(event.target.value.toLowerCase().replace(/\s/g, '_')); setError('') }} disabled={busy} autoFocus autoComplete="off" spellCheck={false} autoCapitalize="off" />
              </div>
            </>
          )}
          <p className="publish-hint">{words.warning ?? 'Lowercase letters and numbers only; use single underscores in place of spaces.'}</p>
          <button type="submit" className={mode === 'delete' ? 'danger' : ''} disabled={busy || !ready}>{busy ? words.busy : words.label}</button>
          {error && <p className="publish-error" role="alert">{error}</p>}
        </form>
      )}
    </Popover>
  )
}
