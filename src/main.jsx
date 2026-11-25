import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/react'
import App from './App.jsx'
import Tutorial from './tutorial/Tutorial.jsx'
import { fetchNote } from './utils/notes.js'
import { sheetPath, sheetSlug } from './utils/route.js'
import './styles.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) throw new Error('Add VITE_CLERK_PUBLISHABLE_KEY to .env.local')

function SheetPage({ slug, onOpenSheet, onNewSheet, onOpenTutorial }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    if (!isLoaded) return undefined
    if (!isSignedIn) return undefined
    fetchNote(slug, getToken).then((sheet) => {
      if (active) setResult({ sheet })
    })
    return () => { active = false }
  }, [slug, isLoaded, isSignedIn, getToken])

  if (isLoaded && !isSignedIn) return <div className="app"><p>Sign in to open saved sheets.</p><a href="/" onClick={(event) => { event.preventDefault(); onOpenSheet(null) }}>Go home</a></div>
  if (!result) return <div className="app">Opening {slug}…</div>
  if (!result.sheet) return <div className="app"><h1>Could not open “{slug}”</h1><p>The sheet may no longer be available.</p><a href="/" onClick={(event) => { event.preventDefault(); onOpenSheet(null) }}>Open my draft</a></div>
  return <App published={{ slug, sheet: result.sheet }} onOpenSheet={onOpenSheet} onNewSheet={onNewSheet} onOpenTutorial={onOpenTutorial} />
}

function Site() {
  const { isLoaded, userId } = useAuth()
  const [path, setPath] = useState(() => window.location.pathname)
  const [fresh, setFresh] = useState(false)
  const [sheetKey, setSheetKey] = useState(0)
  // Held here, above App, so opening or starting a sheet doesn't close it.
  // Only the toolbar's ? button opens it.
  const [showTutorial, setShowTutorial] = useState(false)
  const openTutorial = () => setShowTutorial(true)
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
  if (!isLoaded) return <div className="app">Loading…</div>
  return (
    <>
      {slug ? <SheetPage key={`${userId}:${slug}`} slug={slug} onOpenSheet={openSheet} onNewSheet={newSheet} onOpenTutorial={openTutorial} /> : <App key={`${userId}:${sheetKey}`} fresh={fresh} onOpenSheet={openSheet} onNewSheet={newSheet} onOpenTutorial={openTutorial} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <Site />
    </ClerkProvider>
  </StrictMode>,
)
