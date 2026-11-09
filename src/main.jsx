import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import NoteIndex from './components/NoteIndex.jsx'
import NotePage from './components/NotePage.jsx'
import { useRoute } from './utils/route.js'
import './styles.css'

/** The whole of the routing: three addresses, one of them the editor itself. */
function Site() {
  const route = useRoute()
  if (route.name === 'index') return <NoteIndex />
  // Keyed by slug: moving between two notes starts the page and the editor
  // under it over on the new one, rather than leaving the old sheet standing
  // while the new file is fetched.
  if (route.name === 'note') return <NotePage key={route.slug} slug={route.slug} />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Site />
  </StrictMode>,
)
