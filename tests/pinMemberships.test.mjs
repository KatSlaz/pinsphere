import { test } from 'node:test'
import assert from 'node:assert/strict'
import { membershipState } from '../src/pinMemberships.js'
const map = { id: 1, submaps: [{ id: 10 }, { id: 11 }] }
test('membership presentation distinguishes partial, complete and direct-only selections', () => {
  assert.deepEqual(membershipState(map, ['submap:10']), { children: [{ id: 10 }], direct: false, applicable: true, partial: true })
  assert.equal(membershipState(map, ['submap:10', 'submap:11']).partial, false)
  assert.deepEqual(membershipState(map, ['map:1']), { children: [], direct: true, applicable: true, partial: false })
})
test('membership presentation scopes children to the loaded parent and never invents connections', () => {
  assert.equal(membershipState(map, ['submap:99', 'map:2']).applicable, false)
  assert.equal(membershipState({ id: 1, submaps: [] }, []).applicable, false)
  assert.equal(membershipState({ id: 1, submaps: [] }, ['map:1']).applicable, true)
})
