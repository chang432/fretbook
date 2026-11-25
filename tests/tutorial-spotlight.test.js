import test from 'node:test'
import assert from 'node:assert/strict'
import { spotlightBox } from '../src/tutorial/spotlight.js'

test('the spotlight covers every marked element, padded on each side', () => {
  const title = { left: 30, top: 20, right: 350, bottom: 100 }
  const toolbar = { left: 30, top: 160, right: 480, bottom: 230 }
  assert.deepEqual(spotlightBox([title, toolbar], 10), { left: 20, top: 10, width: 470, height: 230 })
})

test('no marked elements means no spotlight', () => {
  assert.equal(spotlightBox([]), null)
})
