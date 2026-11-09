import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

function Site() {
  const [opened, setOpened] = useState({ published: null, key: 0 })
  const openSheet = (published) => setOpened((current) => ({ published, key: current.key + 1 }))
  return <App key={opened.key} published={opened.published} onOpenSheet={openSheet} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Site />
  </StrictMode>,
)
