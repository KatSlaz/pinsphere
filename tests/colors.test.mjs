import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHex, COLOR_PRESETS } from '../src/colors.js'
test('custom hex colors normalize without accepting CSS injection or invalid values', () => {
  assert.equal(normalizeHex(' #AbC '), '#aabbcc')
  assert.equal(normalizeHex('123456'), '#123456')
  for (const value of ['', '#12', '#abcdef00', 'red', 'url(x)', '#xyzxyz']) assert.equal(normalizeHex(value), null)
  for (const value of COLOR_PRESETS) assert.equal(normalizeHex(value), value)
})
