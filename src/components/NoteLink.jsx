import { navigate } from '../utils/route.js'

/**
 * A link inside the site. It is a real <a href>, so it can be middle-clicked,
 * copied and opened in a new tab like any other; the press handler only takes
 * over the plain left click, which the router can answer without a reload.
 */
export default function NoteLink({ to, className, children }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        // Anything asking for a second window is the browser's to handle.
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
