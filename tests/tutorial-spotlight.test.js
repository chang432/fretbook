import test from 'node:test'
import assert from 'node:assert/strict'
import { nearestToMiddle, popupPlacement, spotlightBox } from '../src/tutorial/spotlight.js'

test('the spotlight covers every marked element, padded on each side', () => {
  const title = { left: 30, top: 20, right: 350, bottom: 100 }
  const toolbar = { left: 30, top: 160, right: 480, bottom: 230 }
  assert.deepEqual(spotlightBox([title, toolbar], 10), { left: 20, top: 10, width: 470, height: 230 })
})

test('no marked elements means no spotlight', () => {
  assert.equal(spotlightBox([]), null)
})

test('the selected position is the usable one nearest the middle', () => {
  assert.equal(nearestToMiddle(16, () => true), 7)
  assert.equal(nearestToMiddle(16, (at) => at !== 7 && at !== 8), 6)
  assert.equal(nearestToMiddle(16, () => false), -1)
})

test('the popup goes below a cut-out in the top half and above one in the bottom half', () => {
  assert.deepEqual(popupPlacement({ top: 20, height: 100 }, 800, 16), { side: 'below', margin: 136 })
  assert.deepEqual(popupPlacement({ top: 700, height: 60 }, 800, 16), { side: 'above', margin: 116 })
})
