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
 * A pencil: edit mode, which is the one way the sheet is worked on rather
 * than written in — rows picked up and swapped, rows moved between groups,
 * and a stretch of notes copied from one place to another. It was two
 * buttons and two drawings, a swap and two sheets, until the two modes were
 * made one.
 */
export function PencilIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 3.6 10.4 L 10.4 3.6 L 12.4 5.6 L 5.6 12.4 Z" />
      <path d="M 3.6 10.4 L 2.8 13.2 L 5.6 12.4" />
      <path d="M 9.0 5.0 L 11.0 7.0" />
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
/** An arrow coming down into a tray: bringing something in from elsewhere. */
export function ImportIcon({ width = 16, height = 16 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.8v7.4" />
      <path d="M4.8 6.4 8 9.6l3.2-3.2" />
      <path d="M2.4 11.2v1.6a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4v-1.6" />
    </svg>
  )
}

export function ExportIcon({ width = 16, height = 16 }) {
  return (
    <svg viewBox="0 0 16 16" width={width} height={height} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 10 V2 M4.8 5.2 8 2 l3.2 3.2 M2.4 11.2 v1.6 a1.4 1.4 0 0 0 1.4 1.4 h8.4 a1.4 1.4 0 0 0 1.4-1.4 v-1.6" />
    </svg>
  )
}

export function RewindIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path className="solid" d="M 7.6 4.4 L 3 8 L 7.6 11.6 Z" />
      <path className="solid" d="M 13 4.4 L 8.4 8 L 13 11.6 Z" />
    </svg>
  )
}

/**
 * A caret and a plus: one more position, on the side the caret points to.
 * The caret is on the outside and the plus beside it — `<+` for the one
 * that goes in before, `+>` for the one that goes in after — so each
 * points away from the position the button came up over, which is the way
 * the row opens.
 */
export function AddColumnIcon({ before = true, width = 20, height = 16 }) {
  // One drawing mirrored about the middle, so the pair cannot drift apart.
  const tip = before ? 4 : 16
  const shoulder = before ? 8 : 12
  const plus = before ? 14 : 6

  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 20 16" aria-hidden="true">
      <path d={`M ${shoulder} 4 L ${tip} 8 L ${shoulder} 12`} />
      <path d={`M ${plus - 3} 8 H ${plus + 3}`} />
      <path d={`M ${plus} 5 V 11`} />
    </svg>
  )
}

/** A cross: the position under it taken off the row altogether. */
export function CrossIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 3.8 3.8 L 12.2 12.2" />
      <path d="M 12.2 3.8 L 3.8 12.2" />
    </svg>
  )
}

/**
 * The mark that opens a group, drawn small: the bar, and the two
 * half-arrows that come off it pointing in over what the group holds. The
 * button wears the thing it makes, so what it does needs no explaining.
 */
export function GroupStartIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path className="solid" d="M 2.2 2 H 4.6 V 14 H 2.2 Z" />
      <path className="solid" d="M 4.6 2 H 11 L 4.6 6.6 Z" />
      <path className="solid" d="M 4.6 14 H 11 L 4.6 9.4 Z" />
    </svg>
  )
}

/** Both group ends facing inward, as on a group reference in the staff. */
export function GroupReferenceIcon({ width = 16, height = 16 }) {
  return (
    <svg className="icon" width={width} height={height} viewBox="0 0 16 16" aria-hidden="true">
      <path className="solid" d="M 1.5 2 H 3.5 V 14 H 1.5 Z M 12.5 2 H 14.5 V 14 H 12.5 Z" />
      <path className="solid" d="M 3.5 2 H 7 L 3.5 5.5 Z M 12.5 2 H 9 L 12.5 5.5 Z M 3.5 14 H 7 L 3.5 10.5 Z M 12.5 14 H 9 L 12.5 10.5 Z" />
    </svg>
  )
}

/**
 * A waste bin: the button in edit mode that takes a whole row off the sheet.
 * Drawn rather than written as a ×, which already closes the shift arrows one
 * column over, and a row going is not the same as a panel closing.
 */
export function TrashIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 2.4 4.4 H 13.6" />
      <path d="M 6.2 4.4 V 2.8 A 0.8 0.8 0 0 1 7 2 H 9 A 0.8 0.8 0 0 1 9.8 2.8 V 4.4" />
      <path d="M 3.8 4.4 L 4.4 13.2 A 1 1 0 0 0 5.4 14 H 10.6 A 1 1 0 0 0 11.6 13.2 L 12.2 4.4" />
      <path d="M 6.6 7 V 11.6" />
      <path d="M 9.4 7 V 11.6" />
    </svg>
  )
}

/**
 * An arrow curving back the way it came: the last action taken off the sheet.
 * It turns anticlockwise, away from the rewind arrows it sits near, so the two
 * do not read as the same control.
 */
export function UndoIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 2.8 5.6 H 9.2 A 3.7 3.7 0 0 1 9.2 13 H 5.2" />
      <path d="M 5.8 2.6 L 2.8 5.6 L 5.8 8.6" />
    </svg>
  )
}
