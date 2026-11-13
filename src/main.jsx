import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App.jsx'
import { fetchNote } from './utils/notes.js'
import { sheetPath, sheetSlug } from './utils/route.js'
import './styles.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) throw new Error('Add VITE_CLERK_PUBLISHABLE_KEY to .env.local')

function SheetPage({ slug, onOpenSheet, onNewSheet }) {
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
  return <App published={{ slug, sheet: result.sheet }} onOpenSheet={onOpenSheet} onNewSheet={onNewSheet} />
}

function Site() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [fresh, setFresh] = useState(false)
  const [sheetKey, setSheetKey] = useState(0)
  useEffect(() => {
    const onPopState = () => { setFresh(false); setPath(window.location.pathname) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openSheet = (slug) => {
    const next = slug ? sheetPath(slug) : '/'
    if (next === window.location.pathname) return
    window.history.pushState(null, '', next)
    setFresh(false)
    setPath(next)
  }
  const newSheet = () => {
    if (window.location.pathname !== '/') window.history.pushState(null, '', '/')
    setPath('/')
    setFresh(true)
    // Remount even when already at / so every press starts another blank sheet.
    setSheetKey((key) => key + 1)
  }
  const slug = sheetSlug(path)
  return slug ? <SheetPage key={slug} slug={slug} onOpenSheet={openSheet} onNewSheet={newSheet} /> : <App key={sheetKey} fresh={fresh} onOpenSheet={openSheet} onNewSheet={newSheet} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <Site />
    </ClerkProvider>
  </StrictMode>,
)
