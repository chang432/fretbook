/**
 * The symbols that stand in for words on buttons — drawn here rather than
 * typed, so none of them depends on a font having the glyph. They share
 * one 16px box and one stroke weight (see `.icon` in styles.css), so buttons
 * holding a symbol sit level with buttons holding words.
 */

/** Speaker, with the sound coming out of it or crossed through. */
export function SoundIcon({ muted = false }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path className="solid" d="M 2.5 6.2 H 5.2 L 8.6 3 V 13 L 5.2 9.8 H 2.5 Z" />
      {muted ? (
        <>
          <path d="M 11 6 L 14 10" />
          <path d="M 14 6 L 11 10" />
        </>
      ) : (
        <>
          <path d="M 11 6.1 Q 12.4 8 11 9.9" />
          <path d="M 13.2 4.4 Q 15.5 8 13.2 11.6" />
        </>
      )}
    </svg>
  )
}

/** A screen on its stand, playing — the song shown to a room. */
export function PresentIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="1.8" width="13" height="8.8" rx="1.5" />
      <path className="solid" d="M 6.8 4 L 10.2 6.2 L 6.8 8.4 Z" />
      <path d="M 8 10.6 V 13.4" />
      <path d="M 5.5 13.4 H 10.5" />
    </svg>
  )
}

/**
 * A note moving to the string above or below it: the arrow is the note, the
 * line is the string it is headed for.
 */
export function NudgeIcon({ up = true }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g transform={up ? undefined : 'rotate(180 8 8)'}>
        <path d="M 2.6 2.6 H 13.4" />
        <path d="M 8 13.6 V 6.2" />
        <path d="M 4.9 9.1 L 8 6 L 11.1 9.1" />
      </g>
    </svg>
  )
}

/**
 * Two rows and a double-headed arrow beside them: the lines are what is being
 * reordered, the arrow the exchange. Edit mode is about the order things stand
 * in rather than about writing, so it is drawn as a swap and not as a pencil.
 */
export function SwapIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 6.4 4 H 14" />
      <path d="M 6.4 12 H 14" />
      <path d="M 3.2 3.2 V 12.8" />
      <path d="M 1.4 5 L 3.2 3.2 L 5 5" />
      <path d="M 1.4 11 L 3.2 12.8 L 5 11" />
    </svg>
  )
}

/**
 * Two sheets, one behind the other: copy mode, which picks a stretch of
 * positions up and writes it down again elsewhere.
 */
export function CopyIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="2.2" width="8" height="9.6" rx="1.4" />
      <path d="M 5.8 14.2 A 1.4 1.4 0 0 1 4.4 12.8" />
      <rect x="5.8" y="4.2" width="8" height="9.6" rx="1.4" />
    </svg>
  )
}

/**
 * A clipboard: the button under each position that says "start the copied
 * stretch here". Sized by its caller, since it sits in the strip above a
 * staff rather than in the toolbar's square buttons.
 */
export function PasteIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 5.4 3 H 3.8 A 1.2 1.2 0 0 0 2.6 4.2 V 13 A 1.2 1.2 0 0 0 3.8 14.2 H 12.2 A 1.2 1.2 0 0 0 13.4 13 V 4.2 A 1.2 1.2 0 0 0 12.2 3 H 10.6" />
      <rect x="5.4" y="1.8" width="5.2" height="2.6" rx="0.9" />
    </svg>
  )
}

/**
 * Rewind: back over ground already covered. Sized by whoever holds it, since
 * it sits in the toolbar's square buttons and in the shallower bar that floats
 * over a selected position; the box it is drawn in stays square either way.
 */
export function RewindIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path className="solid" d="M 7.6 4.4 L 3 8 L 7.6 11.6 Z" />
      <path className="solid" d="M 13 4.4 L 8.4 8 L 13 11.6 Z" />
    </svg>
  )
}
