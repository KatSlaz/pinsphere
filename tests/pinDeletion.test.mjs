import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRemovePinConnections, createPinDeletion, deletionFeedback } from '../src/pinDeletion.js'

const pin = { id: 12, maps: ['map:2', 'submap:3', 'submap:4'] }
const map = role => ({ id: 2, role, submaps: [{ id: 3 }, { id: 4 }] })
const refreshed = async () => true

test('Owners and Editors can remove direct and submap memberships; Viewers cannot', () => {
  for (const role of ['owner', 'editor']) {
    assert.equal(canRemovePinConnections(pin, [map(role)]), true)
    assert.equal(canRemovePinConnections({ ...pin, maps: ['submap:3'] }, [map(role)]), true)
  }
  for (const role of ['viewer', undefined]) assert.equal(canRemovePinConnections(pin, [map(role)]), false)
  assert.equal(canRemovePinConnections({ ...pin, maps: [] }, [map('owner')]), false)
  assert.equal(canRemovePinConnections(pin, []), false)
  assert.equal(canRemovePinConnections({ ...pin, maps: ['map:99'] }, [map('owner')]), false)
})

test('mixed visible and inaccessible memberships do not block an editable connection', () => {
  assert.equal(canRemovePinConnections({ ...pin, maps: ['submap:3', 'map:99'] }, [map('editor')]), true)
})

test('one scoped RPC handles all memberships; client never deletes the underlying pin', async () => {
  for (const role of ['owner', 'editor']) {
    const calls = []
    const client = { rpc: async (...args) => { calls.push(args); return { data: true } } }
    const deletion = createPinDeletion(client)
    let reads = 0
    assert.deepEqual(await deletion.remove(pin.id, canRemovePinConnections(pin, [map(role)]), async () => { reads++; return true }), { outcome: 'saved', refreshed: true })
    assert.deepEqual(calls, [['delete_pin_from_editable_maps', { p_pin_id: 12 }]])
    assert.equal(reads, 1)
  }
})

test('Viewer and unconnected creator never send a deletion request', async () => {
  const deletion = createPinDeletion({ rpc: () => assert.fail('must not write') })
  assert.equal(await deletion.remove(12, false, refreshed), null)
})

test('concurrent permission changes are handled by a false RPC response and refresh', async () => {
  const deletion = createPinDeletion({ rpc: async () => ({ data: false }) })
  const result = await deletion.remove(12, true, refreshed)
  assert.deepEqual(result, { outcome: 'unavailable', refreshed: true })
  assert.match(deletionFeedback(result), /access or the pin may have changed/)
})

test('lost responses, RPC failures, and deadlocks refresh once without automatic retry', async () => {
  for (const rpc of [
    async () => { throw new TypeError('Failed to fetch') },
    async () => ({ error: { code: '08007', message: 'private details' } }),
    async () => ({ error: { code: '40P01', message: 'private details' } }),
    async () => ({ data: null }),
  ]) {
    let writes = 0, reads = 0
    const deletion = createPinDeletion({ rpc: async () => { writes++; return rpc() } })
    const result = await deletion.remove(12, true, async () => { reads++; return true })
    assert.deepEqual(result, { outcome: 'uncertain', refreshed: true })
    assert.equal(writes, 1); assert.equal(reads, 1)
    assert.doesNotMatch(deletionFeedback(result), /private details/)
  }
})

test('failed recovery stays locked across reopen; refresh-only recovery cannot repeat a write', async () => {
  let writes = 0
  const deletion = createPinDeletion({ rpc: async () => { writes++; throw new TypeError('Response lost') } })
  const result = await deletion.remove(12, true, async () => false)
  assert.equal(result.refreshed, false)
  assert.equal(deletion.needsRefresh(12), true)
  assert.equal(await deletion.remove(12, true, refreshed), null)
  assert.equal(writes, 1)
  assert.deepEqual(await deletion.refresh(12, refreshed), { outcome: 'uncertain', refreshed: true })
  assert.equal(deletion.needsRefresh(12), false)
  assert.equal(writes, 1)
})

test('confirmed removal and failed refetch are distinguished from uncertain writes', async () => {
  const deletion = createPinDeletion({ rpc: async () => ({ data: true }) })
  const result = await deletion.remove(12, true, async () => { throw new Error('Offline') })
  assert.match(deletionFeedback(result), /removal succeeded/)
  assert.equal(deletion.needsRefresh(12), true)
  assert.equal((await deletion.refresh(12, refreshed)).outcome, 'saved')
})

test('duplicate submissions remain blocked while the write or recovery is pending', async () => {
  let finish, finishRead, writes = 0
  const deletion = createPinDeletion({ rpc: () => { writes++; return new Promise(resolve => { finish = resolve }) } })
  const request = deletion.remove(12, true, () => new Promise(resolve => { finishRead = resolve }))
  assert.equal(await deletion.remove(12, true, refreshed), null)
  finish({ data: true }); await Promise.resolve(); await Promise.resolve()
  assert.equal(await deletion.remove(12, true, refreshed), null)
  assert.equal(await deletion.refresh(12, refreshed), null)
  finishRead(true); await request
  assert.equal(writes, 1)
})

// Contract simulation, not proof of live RLS/transaction behavior. The client
// sends only a pin ID; protected memberships and cleanup stay server-owned.
test('RPC contract preserves protected memberships and an Editor cannot clean up another creator pin', async () => {
  for (const protectedConnection of [true, false]) {
    let connections = [2, 3, ...(protectedConnection ? [99] : [])]
    const record = { creator: 'other-user', exists: true }
    const deletion = createPinDeletion({ rpc: async () => {
      connections = connections.filter(parent => ![2, 3].includes(parent))
      if (!connections.length && record.creator === 'editor') record.exists = false
      return { data: true }
    } })
    await deletion.remove(12, true, refreshed)
    assert.deepEqual(connections, protectedConnection ? [99] : [])
    assert.equal(record.exists, true)
  }
})
import { readDeletionMaps } from '../src/pinDeletion.js'

test('post-delete refresh replaces accessible maps and roles without resetting visibility', async () => {
  const responses = {
    maps: {data:[{id:2,user_id:'other',name:'Family',color:'#f00',sort_order:1}]},
    submaps: {data:[{id:3,map_id:2,name:'Food',color:'#0f0',sort_order:0}]},
    map_collaborators: {data:[{map_id:2,role:'viewer'}]},
  }
  const client={from:table=>({select(){return this},order:async()=>responses[table],eq:async()=>responses[table]})}
  const fresh = await readDeletionMaps(client,'editor',[{...map('editor'),visible:true,submaps:[{id:3,visible:true}]},{id:99,role:'editor'}])
  assert.equal(fresh.length,1)
  assert.equal(fresh[0].role,'viewer')
  assert.equal(fresh[0].visible,true)
  assert.equal(fresh[0].submaps[0].visible,true)
  assert.equal(canRemovePinConnections(pin,fresh),false)
})

test('failed destination/role reads cannot count as a successful recovery', async () => {
  for (const failed of ['maps','submaps','map_collaborators']) {
    const client={from:table=>({select(){return this},order:async()=>table===failed?{error:{message:'Private'}}:{data:[]},eq:async()=>table===failed?{data:null}:{data:[]}})}
    await assert.rejects(readDeletionMaps(client,'owner',[]),/Could not refresh map access/)
  }
})
