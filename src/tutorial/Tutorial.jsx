import { useEffect, useRef, useState } from 'react'
import { TUTORIAL_STEPS } from './steps.js'
import './tutorial.css'

/**
 * A walkthrough laid over the site: a dimmed backdrop with one step's popup in
 * the middle. "Next" advances through TUTORIAL_STEPS and, on the last step,
 * closes the tutorial.
 */
export default function Tutorial({ onClose }) {
  const [index, setIndex] = useState(0)
  const nextButton = useRef(null)
  const step = TUTORIAL_STEPS[index]
  const isLast = index === TUTORIAL_STEPS.length - 1

  // Focus "next" whenever the step changes, so Enter walks through the tour.
  useEffect(() => { nextButton.current?.focus() }, [index])

  const next = () => (isLast ? onClose() : setIndex(index + 1))

  return (
    <div className="tutorial-backdrop">
      <section className="tutorial-popup" role="dialog" aria-modal="true" aria-label="Fretbook tutorial">
        <p className="tutorial-body">{step.body}</p>
        <div className="tutorial-footer">
          <span className="tutorial-progress">step {index + 1}/{TUTORIAL_STEPS.length}</span>
          <button ref={nextButton} type="button" className="tutorial-next" onClick={next}>next</button>
        </div>
      </section>
    </div>
  )
}
