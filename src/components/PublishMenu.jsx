import { useState } from 'react'
import Popover from './Popover.jsx'
import { NOTE_NAME } from '../utils/files.js'
import { followSheetLink, sheetPath } from '../utils/route.js'

const MODES = {
  publish: { label: 'Save', busy: 'Saving…', done: 'Saved.' },
  update: { label: 'Update', busy: 'Updating…', done: 'Updated.', warning: 'This replaces the saved sheet.' },
  delete: { label: 'Delete', busy: 'Deleting…', done: 'Deleted.', warning: 'This permanently deletes the saved sheet.' },
}

/**
 * The panel under Save, Update and Delete: what is about to happen, and the
 * button that does it. Save names the sheet after its title on the main
 * screen, so there is nothing to type here.
 */
export default function PublishMenu({ anchor, mode = 'publish', note = null, slug: titleSlug = '', onClose, onWrite, onOpen }) {
  const words = MODES[mode]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [written, setWritten] = useState(null)
  const slug = mode === 'publish' ? titleSlug : note
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
          {mode === 'publish' && <p className="publish-confirm">Save current sheet as '{slug}'?</p>}
          {words.warning && <p className="publish-hint">{words.warning}</p>}
          <button type="submit" className={mode === 'delete' ? 'danger' : ''} disabled={busy || !ready}>{busy ? words.busy : words.label}</button>
          {error && <p className="publish-error" role="alert">{error}</p>}
        </form>
      )}
    </Popover>
  )
}
