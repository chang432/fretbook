import test from 'node:test'
import assert from 'node:assert/strict'
import { sheetPath, sheetSlug } from '../src/utils/route.js'

test('saved sheet paths resolve by name, without a separate list route', () => {
  assert.equal(sheetPath('my-song_2'), '/sheets/my-song_2')
  assert.equal(sheetSlug('/sheets/my-song_2'), 'my-song_2')
  assert.equal(sheetSlug('/sheets/My_Song2'), 'My_Song2')
  assert.equal(sheetSlug('/sheets/my-song_2/'), 'my-song_2')
  for (const path of ['/', '/sheets', '/sheets/../other', '/sheets/a/b', '/sheets/%ZZ']) {
    assert.equal(sheetSlug(path), null)
  }
})
