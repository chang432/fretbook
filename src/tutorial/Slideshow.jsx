import { useState } from 'react'

/**
 * A run of screenshots, each with its description, shown one at a time.
 * Its arrows only appear once there's more than one slide. They move through
 * the slides alone; the popup's own previous/next still move between steps.
 */
export default function Slideshow({ slides }) {
  const [index, setIndex] = useState(0)
  const slide = slides[index]
  const many = slides.length > 1

  return (
    <div className="tutorial-slideshow">
      <img className="tutorial-slide-image" src={slide.image} alt={slide.alt} />
      <p className="tutorial-body">{slide.caption}</p>
      {many && (
        <div className="tutorial-slide-nav">
          <button type="button" className="tutorial-slide-arrow" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="Previous slide">‹</button>
          <span className="tutorial-progress">slide {index + 1}/{slides.length}</span>
          <button type="button" className="tutorial-slide-arrow" onClick={() => setIndex(index + 1)} disabled={index === slides.length - 1} aria-label="Next slide">›</button>
        </div>
      )}
    </div>
  )
}
