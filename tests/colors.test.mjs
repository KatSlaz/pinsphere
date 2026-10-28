import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHex, COLOR_PRESETS, hexToHsv, hsvToHex, hsvFromPoint, adjustHsv } from '../src/colors.js'
test('custom hex colors normalize without accepting CSS injection or invalid values', () => {
  assert.equal(normalizeHex(' #AbC '), '#aabbcc')
  assert.equal(normalizeHex('123456'), '#123456')
  for (const value of ['', '#12', '#abcdef00', 'red', 'url(x)', '#xyzxyz']) assert.equal(normalizeHex(value), null)
  for (const value of COLOR_PRESETS) assert.equal(normalizeHex(value), value)
})

test('HSV conversion round-trips presets, primary colors and achromatic colors', () => {
  for (const hex of [...COLOR_PRESETS, '#000000', '#ffffff', '#808080', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#abcdef']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex)
  }
  assert.equal(hexToHsv('invalid'), null)
  assert.equal(hexToHsv('#000000', 270).h, 270)
  assert.equal(hexToHsv('#ffffff', 120).h, 120)
  assert.equal(hsvToHex({ h: 360, s: 100, v: 100 }), '#ff0000')
  assert.equal(hsvToHex({ h: -120, s: 100, v: 100 }), '#0000ff')
  assert.equal(hsvToHex({ h: NaN, s: 50, v: 50 }), null)
})

test('pointer selection maps both axes, clamps outside drags and rejects zero-size areas', () => {
  const hsv = { h: 0, s: 0, v: 0 }, rect = { left: 10, top: 20, width: 200, height: 100 }
  assert.deepEqual(hsvFromPoint(hsv, rect, 110, 70), { h: 0, s: 50, v: 50 })
  assert.equal(hsvToHex(hsvFromPoint(hsv, rect, 110, 70)), '#804040')
  assert.equal(hsvToHex(hsvFromPoint(hsv, rect, -10, -10)), '#ffffff')
  assert.equal(hsvToHex(hsvFromPoint(hsv, rect, 500, 500)), '#000000')
  assert.equal(hsvFromPoint(hsv, { ...rect, width: 0 }, 10, 20), null)
})

test('keyboard color adjustment supports both axes, larger steps and limits', () => {
  const hsv = { h: 200, s: 50, v: 50 }
  assert.deepEqual(adjustHsv(hsv, 'ArrowLeft'), { ...hsv, s: 49 })
  assert.deepEqual(adjustHsv(hsv, 'ArrowRight', true), { ...hsv, s: 60 })
  assert.deepEqual(adjustHsv(hsv, 'ArrowUp'), { ...hsv, v: 51 })
  assert.deepEqual(adjustHsv(hsv, 'ArrowDown', true), { ...hsv, v: 40 })
  assert.equal(adjustHsv({ ...hsv, s: 99 }, 'ArrowRight', true).s, 100)
  assert.equal(adjustHsv({ ...hsv, v: 1 }, 'ArrowDown', true).v, 0)
  assert.equal(adjustHsv(hsv, 'Home').s, 0)
  assert.equal(adjustHsv(hsv, 'End').s, 100)
  assert.equal(adjustHsv(hsv, 'PageUp').v, 100)
  assert.equal(adjustHsv(hsv, 'PageDown').v, 0)
  assert.equal(adjustHsv(hsv, 'Tab'), null)
  assert.equal(adjustHsv(hsv, 'Escape'), null)
})
