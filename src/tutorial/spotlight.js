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

/** Measure the elements marked `data-tutorial="<key>"` in viewport coordinates. */
export function measureSpotlight(key) {
  const elements = document.querySelectorAll(`[data-tutorial="${key}"]`)
  return spotlightBox([...elements].map((element) => element.getBoundingClientRect()))
}
