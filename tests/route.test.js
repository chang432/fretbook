import test from 'node:test'
import assert from 'node:assert/strict'
import { publicSheetPath, publicSheetSlug, sheetPath, sheetSlug } from '../src/utils/route.js'

test('saved sheet paths resolve by name, without a separate list route', () => {
  assert.equal(sheetPath('my-song_2'), '/sheets/my-song_2')
  assert.equal(sheetSlug('/sheets/my-song_2'), 'my-song_2')
  assert.equal(sheetSlug('/sheets/My_Song2'), 'My_Song2')
  assert.equal(sheetSlug('/sheets/my-song_2/'), 'my-song_2')
  for (const path of ['/', '/sheets', '/sheets/../other', '/sheets/a/b', '/sheets/%ZZ']) {
    assert.equal(sheetSlug(path), null)
  }
})

test('public sheet paths sit under /sheets/public/ and never read as a saved sheet', () => {
  assert.equal(publicSheetPath('my_song'), '/sheets/public/my_song')
  assert.equal(publicSheetSlug('/sheets/public/my_song'), 'my_song')
  assert.equal(publicSheetSlug('/sheets/public/my_song/'), 'my_song')
  assert.equal(sheetSlug('/sheets/public/my_song'), null)
  // A user's own sheet may still be called "public".
  assert.equal(sheetSlug('/sheets/public'), 'public')
  for (const path of ['/sheets/public', '/sheets/public/', '/sheets/public/a/b', '/sheets/public/../x', '/sheets/my_song']) {
    assert.equal(publicSheetSlug(path), null)
  }
})
