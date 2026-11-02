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

import { createPinRecovery, readFreshPin } from '../src/pinSaveSafety.js'
const baseline = { id: 12, userId: 'owner', name: 'Old', notes: '', maps: ['map:1'] }
const draft = { name: 'My edited place', notes: 'Keep these notes', maps: ['map:1', 'submap:2'] }
function clientWith(read) {
  return { from(table) { return { select() { return this }, eq() { return table === 'pins' ? this : read(table) }, single() { return read(table) } } } }
}
const savedPin = { id: 12, user_id: 'owner', name: 'My edited place', notes: 'Keep these notes', longitude: 1, latitude: 2 }
test('committed connection + lost response stays locked across failed recovery and close/reopen', async () => {
  const recovery = createPinRecovery()
  // The server committed the connection, but the write response was lost.
  const server = [{ map_id: 1, submap_id: null }, { map_id: null, submap_id: 2 }]
  recovery.lock(baseline, draft)
  const failing = clientWith(async table => table === 'pins' ? { data: savedPin } : { error: new Error('Offline') })
  await assert.rejects(recovery.recover(failing, 12), /verify the saved connections/)
  // Closing/reopening reads the same guard rather than clearing a UI boolean.
  recovery.keepDraft(12, { ...draft, notes: 'New unsaved notes' })
  assert.equal(Boolean(recovery.get(12)), true)
  assert.equal(recovery.get(12).draft.notes, 'New unsaved notes')
  const result = await recovery.recover(clientWith(async table => ({ data: table === 'pins' ? savedPin : server })), 12)
  assert.equal(recovery.get(12), null)
  assert.deepEqual(result.pin.maps, ['map:1', 'submap:2'])
  assert.deepEqual(result.draft.maps.filter(id => !result.pin.maps.includes(id)), [])
  assert.equal(result.draft.notes, 'New unsaved notes')
})
test('recovery rebases membership intent without deleting concurrent additions', async () => {
  const recovery = createPinRecovery()
  recovery.lock(baseline, { ...draft, maps: ['submap:2'] })
  const result = await recovery.recover(clientWith(async table => ({ data: table === 'pins' ? savedPin : [{map_id:1}, {submap_id:2}, {map_id:99}] })), 12)
  assert.deepEqual(result.draft.maps, ['submap:2', 'map:99'])
})
test('failed, missing, malformed and denied fresh reads never unlock recovery', async () => {
  for (const read of [
    async () => ({error:{code:'42501'}}),
    async () => ({data:null}),
    async table => ({data:table === 'pins' ? {...savedPin,id:99} : []}),
    async table => ({data:table === 'pins' ? savedPin : null}),
    async table => ({data:table === 'pins' ? savedPin : [{}]}),
    async () => { throw new TypeError('Network failed') },
  ]) {
    const recovery = createPinRecovery(); recovery.lock(baseline,draft)
    await assert.rejects(recovery.recover(clientWith(read),12))
    assert.deepEqual(recovery.get(12).draft,draft)
  }
})
test('empty verified memberships are distinct from a failed connection response', async () => {
  const pin = await readFreshPin(clientWith(async table => ({data:table === 'pins' ? savedPin : []})),12)
  assert.deepEqual(pin.maps,[])
})
test('an obsolete recovery cannot clear a newer uncertain save', async () => {
  let finish
  const recovery = createPinRecovery();recovery.lock(baseline,draft)
  const request = recovery.recover(clientWith(table => table === 'pins' ? Promise.resolve({data:savedPin}) : new Promise(resolve => {finish=resolve})),12)
  await Promise.resolve()
  recovery.lock(baseline,{...draft,notes:'New failure'})
  finish({data:[]})
  await assert.rejects(request,/changed during recovery/)
  assert.equal(recovery.get(12).draft.notes,'New failure')
})
test('uncertain creation remains blocked independently of edit recovery and draft copies', async () => {
  const recovery = createPinRecovery()
  recovery.lockCreation({...draft,location:{longitude:1,latitude:2}})
  const opened = recovery.getCreation();opened.maps.push('map:999')
  recovery.lock(baseline,draft)
  await recovery.recover(clientWith(async table=>({data:table==='pins'?savedPin:[]})),12)
  assert.deepEqual(recovery.getCreation().maps,draft.maps)
  assert.deepEqual(recovery.getCreation().location,{longitude:1,latitude:2})
})

test('recovery retains concurrent detail changes when the user did not edit those fields', async () => {
  const recovery=createPinRecovery()
  recovery.lock(baseline,{...draft,name:baseline.name,notes:baseline.notes})
  const result=await recovery.recover(clientWith(async table=>({data:table==='pins'?{...savedPin,name:'Updated elsewhere',notes:'Server notes'}:[]})),12)
  assert.equal(result.draft.name,'Updated elsewhere')
  assert.equal(result.draft.notes,'Server notes')
})
