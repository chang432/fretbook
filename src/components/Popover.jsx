import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { popoverPlacement } from '../utils/popover.js'

/**
 * A small panel hanging under the control that opened it. Positioned `fixed`
 * from that control's own rect, so the rows' scroll containers cannot clip it,
 * and it follows the control when anything scrolls.
 *
 * It closes on Escape or on a press anywhere outside itself. The anchor is
 * excluded from that: pressing it again is its own business, so its click
 * handler decides rather than this closing first and reopening after.
 */
export default function Popover({ anchor, className, label, onClose, children }) {
  const [place, setPlace] = useState(null)
  const panel = useRef(null)

  useLayoutEffect(() => {
    // Measured, not assumed: where the panel can sit depends on how big it is,
    // which is why it is rendered (hidden) before it is placed.
    const position = () => {
      const box = panel.current
      if (!box) return
      setPlace(
        popoverPlacement(
          anchor.getBoundingClientRect(),
          { width: box.offsetWidth, height: box.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      )
    }

    position()
    // `true` catches a row scrolling as well as the page.
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [anchor])

  useEffect(() => {
    const onPointerDown = (event) => {
      if (panel.current?.contains(event.target) || anchor.contains(event.target)) return
      onClose()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={panel}
      className={`popover ${className}`}
      // Invisible for the one layout pass it takes to measure itself. The
      // measure and the placement both happen before paint, so this never
      // shows. It is opacity rather than `visibility: hidden` because a field
      // inside a hidden panel cannot take focus, which would leave a panel
      // that opens on a field — the tempo prompt — needing a click first.
      style={
        place
          ? {
              left: `${place.x}px`,
              top: `${place.y}px`,
              transform: `translate(-50%, ${place.below ? '0' : '-100%'})`,
            }
          : { left: 0, top: 0, opacity: 0, pointerEvents: 'none' }
      }
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  )
}
