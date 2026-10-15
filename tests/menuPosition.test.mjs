import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menuFocusIndex, menuPosition } from '../src/menuPosition.js'

test('menu anchors to trigger and flips above near the bottom', () => {
  const viewport = { width: 390, height: 700 }
  const menu = { width: 176, height: 240 }
  assert.deepEqual(menuPosition({ right: 240, top: 90, bottom: 120 }, menu, viewport), { left: 64, top: 124 })
  assert.deepEqual(menuPosition({ right: 240, top: 620, bottom: 650 }, menu, viewport), { left: 64, top: 376 })
})

test('menu clamps to viewport edges including oversize menus and narrow screens', () => {
  const viewport = { width: 320, height: 400 }
  const menu = { width: 176, height: 240 }
  assert.equal(menuPosition({ right: 90, top: 20, bottom: 40 }, menu, viewport).left, 8)
  assert.equal(menuPosition({ right: 500, top: 20, bottom: 40 }, menu, viewport).left, 136)
  assert.deepEqual(menuPosition({ right: 300, top: 200, bottom: 220 }, { width: 600, height: 900 }, viewport), { left: 8, top: 8 })
})

test('keyboard navigation wraps and supports Home/End without capturing unrelated keys', () => {
  assert.equal(menuFocusIndex('ArrowDown', 2, 3), 0)
  assert.equal(menuFocusIndex('ArrowUp', 0, 3), 2)
  assert.equal(menuFocusIndex('Home', 2, 3), 0)
  assert.equal(menuFocusIndex('End', 0, 3), 2)
  assert.equal(menuFocusIndex('ArrowDown', -1, 3), 0)
  assert.equal(menuFocusIndex('Enter', 0, 3), -1)
  assert.equal(menuFocusIndex('ArrowDown', 0, 0), -1)
})
