import { useLayoutEffect, useState } from 'react'
import { NudgeIcon, RewindIcon } from './icons.jsx'
import { MARK_WIDTH, markPath } from '../utils/layout.js'
import { MARK_SYMBOLS, MARK_ZIGZAG } from '../utils/tab.js'

const LABELS = {
  [MARK_ZIGZAG]: 'Zigzag above note (w)',
}

/** The arc drawn on the tie button, sized to the same box as the zigzag. */
const TIE_ICON = `M 2 11 Q ${(MARK_WIDTH + 6) / 2} 1 ${MARK_WIDTH + 4} 11`

/** Room the bar needs above a note before it has to flip below it instead. */
const CLEARANCE = 52

/**
 * Buttons floating over the position being edited: the rewind that fills it
 * with the last position written before it, the two arrows that send the note
 * to another string without changing its pitch, the tie button that arms the
 * next tap, and the zigzag that goes above the number. The rewind stands
 * whether or not anything is written here — filling an empty position is what
 * it is for — while the rest need a note to work on, and the arrows need
 * somewhere for it to go. The bar carries whichever apply and nothing at all
 * when none do.
 *
 * Positioned `fixed` from the cell's own rect so it escapes the sheet's scroll
 * clipping, and it never takes focus — the position stays selected while you
 * tap the buttons.
 */
export default function MarkBar({
  anchor,
  active,
  onToggle,
  hasNote,
  canTie,
  tieArmed,
  onTie,
  canCopy,
  onCopy,
  moves,
  onNudge,
}) {
  const [place, setPlace] = useState(null)

  useLayoutEffect(() => {
    if (!anchor) return undefined

    const position = () => {
      const rect = anchor.getBoundingClientRect()
      setPlace({
        x: rect.left + rect.width / 2,
        y: rect.top < CLEARANCE ? rect.bottom + 6 : rect.top - 6,
        below: rect.top < CLEARANCE,
      })
    }

    position()
    // `true` catches scrolling of the sheet as well as the page.
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [anchor])

  if (!place || (!canCopy && !canTie && !hasNote)) return null

  return (
    <div
      className="mark-bar"
      style={{
        left: `${place.x}px`,
        top: `${place.y}px`,
        transform: `translate(-50%, ${place.below ? '0' : '-100%'})`,
      }}
      role="group"
      aria-label="This position"
    >
      {canCopy && (
        <button
          type="button"
          className="mark-button"
          title="Fill this position with the one written before it (r)"
          aria-label="Fill this position with the one written before it"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCopy}
        >
          <RewindIcon width={MARK_WIDTH + 6} height="14" />
        </button>
      )}
      {moves.map((move) => (
        <button
          key={move.step}
          type="button"
          className="mark-button"
          title={`Move this note to the ${move.label} string, fret ${move.fret} — ${
            move.note
          } (shift+${move.step < 0 ? '↑' : '↓'})`}
          aria-label={`Move this note to the ${move.label} string`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onNudge(move.step)}
        >
          <NudgeIcon up={move.step < 0} />
        </button>
      ))}
      {canTie && (
        <button
          type="button"
          className={`mark-button mark-button--tie${tieArmed ? ' is-active' : ''}`}
          title={
            tieArmed
              ? 'Now press a highlighted position'
              : 'Hold this note through to another position (t)'
          }
          aria-label="Hold this note through to another position"
          aria-pressed={tieArmed}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onTie}
        >
          <svg width={MARK_WIDTH + 6} height="14" aria-hidden="true">
            <path d={TIE_ICON} />
          </svg>
        </button>
      )}
      {hasNote &&
        MARK_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            className={`mark-button${active === symbol ? ' is-active' : ''}`}
            title={LABELS[symbol]}
            aria-label={LABELS[symbol]}
            aria-pressed={active === symbol}
            // Keep the note focused so the bar does not vanish out from under the tap.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onToggle(symbol)}
          >
            <svg width={MARK_WIDTH + 6} height="14" aria-hidden="true">
              <path d={markPath((MARK_WIDTH + 6) / 2, 7)} />
            </svg>
          </button>
        ))}
    </div>
  )
}
