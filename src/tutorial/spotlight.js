/*
 * Where the tutorial's cut-out goes. A step names a `data-tutorial` key; every
 * element carrying it is measured and the cut-out covers all of them, plus a
 * margin so the highlight doesn't hug the controls.
 */
export const SPOTLIGHT_PADDING = 12

/** The smallest box around every rect, grown by `padding` on each side; null for none. */
export function spotlightBox(rects, padding = SPOTLIGHT_PADDING) {
  if (!rects.length) return null
  const left = Math.min(...rects.map((rect) => rect.left)) - padding
  const top = Math.min(...rects.map((rect) => rect.top)) - padding
  const right = Math.max(...rects.map((rect) => rect.right)) + padding
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) + padding
  return { left, top, width: right - left, height: bottom - top }
}

/** Measure the elements marked with any of `keys` (`data-tutorial="<key>"`) in viewport coordinates. */
export function measureSpotlight(keys) {
  const elements = document.querySelectorAll(keys.map((key) => `[data-tutorial="${key}"]`).join(', '))
  return spotlightBox([...elements].map((element) => element.getBoundingClientRect()))
}

/** The index nearest the middle of `length` positions, among the indices `usable` allows. */
export function nearestToMiddle(length, usable) {
  const middle = (length - 1) / 2
  let best = -1
  for (let at = 0; at < length; at += 1) {
    if (usable(at) && (best === -1 || Math.abs(at - middle) < Math.abs(best - middle))) best = at
  }
  return best
}

/**
 * Select an empty, writable position on `string` of the first row, as near
 * the middle of the row as there is one. Focusing it is exactly what a click
 * does, so the editor opens its note menu over it.
 *
 * Returns a cleanup that closes the menu again: the editor drops it on any
 * pointerdown outside the cell, which a keyboard "next" never produces, so
 * one is sent on the tutorial's behalf.
 */
export function selectMiddleCell(string) {
  const cells = [...document.querySelectorAll('[data-tutorial="first-row"] input')]
    .filter((input) => input.getAttribute('aria-label')?.includes(`, string ${string}, position `))
  const at = nearestToMiddle(cells.length, (index) => !cells[index].readOnly && !cells[index].value)
  if (at === -1) return undefined
  // Blur first: focusing a cell that already has focus fires no focus
  // event, and StrictMode's double-run of effects leaves it focused.
  cells[at].blur()
  cells[at].focus()
  return () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}
