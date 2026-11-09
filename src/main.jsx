import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { fetchNote } from './utils/notes.js'
import { sheetPath, sheetSlug } from './utils/route.js'
import './styles.css'

function SheetPage({ slug, onOpenSheet }) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    fetchNote(slug).then((sheet) => {
      if (active) setResult({ sheet })
    })
    return () => { active = false }
  }, [slug])

  if (!result) return <div className="app">Opening {slug}…</div>
  if (!result.sheet) return <div className="app"><h1>Could not open “{slug}”</h1><p>The sheet may no longer be available.</p><a href="/" onClick={(event) => { event.preventDefault(); onOpenSheet(null) }}>Open my draft</a></div>
  return <App published={{ slug, sheet: result.sheet }} onOpenSheet={onOpenSheet} />
}

function Site() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openSheet = (slug) => {
    const next = slug ? sheetPath(slug) : '/'
    if (next === window.location.pathname) return
    window.history.pushState(null, '', next)
    setPath(next)
  }
  const slug = sheetSlug(path)
  return slug ? <SheetPage key={slug} slug={slug} onOpenSheet={openSheet} /> : <App onOpenSheet={openSheet} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Site />
  </StrictMode>,
)
