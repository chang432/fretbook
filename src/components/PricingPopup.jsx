import { useEffect, useRef } from 'react'
import { PricingTable } from '@clerk/react'

/** Keep the pricing table open while Clerk opens its own checkout drawer. */
export default function PricingPopup({ onClose }) {
  const closeButton = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    closeButton.current?.focus()
    return () => previous?.focus()
  }, [])

  return (
    <div className="pricing-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section
        className="pricing-popup"
        role="dialog"
        aria-labelledby="pricing-title"
        onKeyDown={(event) => { if (event.key === 'Escape' && event.currentTarget.contains(event.target)) { event.stopPropagation(); onClose() } }}
      >
        <div className="pricing-heading">
          <h2 id="pricing-title">Support Us!</h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close subscriptions">×</button>
        </div>
        <PricingTable for="user" fallback={<p>Loading plans…</p>} />
      </section>
    </div>
  )
}
