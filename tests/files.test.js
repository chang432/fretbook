import test from 'node:test'
import assert from 'node:assert/strict'
import { NOTE_NAME, SAVED_NOTE_NAME, slugify } from '../src/utils/files.js'

test('new sheet names use letters and numbers separated by underscores', () => {
  for (const name of ['Song', 'song_2', 'A1']) assert.equal(NOTE_NAME.test(name), true)
  for (const name of ['', 'song-name', 'song name', '_song', 'song_', 'song__name', 'song!']) {
    assert.equal(NOTE_NAME.test(name), false)
  }
  assert.equal(slugify('My Song 2'), 'my_song_2')
  assert.equal(SAVED_NOTE_NAME.test('old-song'), true)
})
