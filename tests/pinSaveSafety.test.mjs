import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRejectedPinWrite, confirmedPinRollback } from '../src/pinSaveSafety.js'

test('only confirmed database rejections allow retrying a pin write', () => {
  for (const code of ['42501', '23505', '23514', '22003']) assert.equal(isRejectedPinWrite({ code }), true)
  for (const code of ['', 'PGRST116', '08007', '40003', 'XX000']) assert.equal(isRejectedPinWrite({ code }), false)
  assert.equal(isRejectedPinWrite(new TypeError('Failed to fetch')), false)
  assert.equal(isRejectedPinWrite(null), false)
})

test('retry after connection failure requires a confirmed rollback of the same pin', () => {
  assert.equal(confirmedPinRollback(12, { data: [{ id: 12 }], error: null }), true)
  for (const data of [null, [], [{ id: 13 }]]) assert.equal(confirmedPinRollback(12, { data, error: null }), false)
  assert.equal(confirmedPinRollback(12, { data: [{ id: 12 }], error: { message: 'Failed' } }), false)
})
