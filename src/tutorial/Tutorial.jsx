import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { measureSpotlight } from './spotlight.js'
import { TUTORIAL_STEPS } from './steps.js'
import './tutorial.css'

/** Space between the cut-out and the popup hung below it. */
const POPUP_GAP = 16

/** Track the current step's cut-out, re-measuring as the page resizes or scrolls. */
function useSpotlight(keys) {
  // Keyed by the joined names, so a fresh array each render doesn't re-run the effect.
  const key = keys?.join(' ')
  // Tagged with its key, so a box measured for an earlier step is never shown.
  const [measured, setMeasured] = useState(null)
  useEffect(() => {
    if (!key) return undefined
    const update = () => setMeasured({ key, box: measureSpotlight(key.split(' ')) })
    // First measure on the next frame, once the page under the overlay has laid out.
    const frame = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    // Capture, so a scroll inside any container moves the cut-out too.
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [key])
  return key && measured?.key === key ? measured.box : null
}

/**
 * A walkthrough laid over the site: the page is dimmed, apart from a rounded
 * cut-out around whatever the current step is about, with that step's popup
 * in the middle. "Next" on the last step closes the tutorial.
 */
export default function Tutorial({ onClose }) {
  const [index, setIndex] = useState(0)
  const nextButton = useRef(null)
  const step = TUTORIAL_STEPS[index]
  const isFirst = index === 0
  const isLast = index === TUTORIAL_STEPS.length - 1
  // Before the spotlight hook, so the page is set up by the time it measures.
  useLayoutEffect(() => step.prepare?.(), [step])
  const spotlight = useSpotlight(step.spotlight)

  // Focus "next" whenever the step changes, so Enter walks through the tour.
  useEffect(() => { nextButton.current?.focus() }, [index])

  const next = () => (isLast ? onClose() : setIndex(index + 1))

  return (
    // The backdrop catches every click, so the page under the cut-out is shown
    // but can't be used mid-tour. When there is a cut-out, its huge shadow does
    // the dimming instead of the backdrop.
    <div className={`tutorial-backdrop${spotlight ? ' has-spotlight' : ''}`}>
      {spotlight && <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />}
      <section
        className={`tutorial-popup${step.images ? ' tutorial-popup--wide' : ''}`}
        // Just below the cut-out, so the popup never covers what it's describing.
        style={spotlight ? { marginTop: spotlight.top + spotlight.height + POPUP_GAP } : undefined}
        role="dialog" aria-modal="true" aria-label="Fretbook tutorial">
        {step.images && (
          <div className="tutorial-images">
            {step.images.map(({ src, alt }) => <img key={src} className="tutorial-image" src={src} alt={alt} />)}
          </div>
        )}
        <p className="tutorial-body">{step.body}</p>
        <div className="tutorial-footer">
          {!isFirst && (
            <button type="button" className="tutorial-button tutorial-previous" onClick={() => setIndex(index - 1)}>
              previous
            </button>
          )}
          <span className="tutorial-progress">step {index + 1}/{TUTORIAL_STEPS.length}</span>
          <button ref={nextButton} type="button" className="tutorial-button tutorial-next" onClick={next}>next</button>
        </div>
      </section>
    </div>
  )
}
