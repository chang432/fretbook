/** Gap between a control and the panel hanging off it. */
const GAP = 6

/** How close to the edge of the window a panel is allowed to come. */
const EDGE = 8

/**
 * Where to put a panel anchored to a control.
 *
 * It hangs centred under the control, but a control near an edge would
 * otherwise push half the panel off the side of the window — so the panel is
 * pulled back inside. It also flips above the control when there is no room
 * for it below. Both matter most on a phone, where the window is barely wider
 * than the panel.
 *
 * `x` is the panel's centre and `y` the edge it hangs from, to be drawn with
 * `translate(-50%, below ? 0 : -100%)`.
 */
export function popoverPlacement(anchor, panel, viewport) {
  const half = panel.width / 2
  const min = EDGE + half
  const max = viewport.width - EDGE - half
  const centre = anchor.left + anchor.width / 2

  return {
    // A panel wider than the window cannot clear both edges; centre it and let
    // its own max-width keep it in bounds.
    x: min > max ? viewport.width / 2 : Math.min(Math.max(centre, min), max),
    y: fitsBelow(anchor, panel, viewport) ? anchor.bottom + GAP : anchor.top - GAP,
    below: fitsBelow(anchor, panel, viewport),
  }
}

const fitsBelow = (anchor, panel, viewport) =>
  anchor.bottom + GAP + panel.height + EDGE <= viewport.height ||
  // Nowhere near enough room either way: below at least scrolls into reach.
  anchor.top - GAP - panel.height < EDGE
