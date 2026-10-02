import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCollaboratorManager, loadCollaborators, writeCollaborator } from '../src/collaborators.js'

test('reads only the map-scoped RPC and puts the owner first', async () => {
  const rows = [
    { user_id: 'viewer-id', email: 'viewer@example.com', role: 'viewer' },
    { user_id: 'owner-id', email: 'owner@example.com', role: 'owner' },
    { user_id: 'editor-id', email: 'editor@example.com', role: 'editor' },
  ]
  const members = await loadCollaborators({ rpc: async (name, args) => {
    assert.equal(name, 'get_map_collaborators')
    assert.deepEqual(args, { p_map_id: 42 })
    return { data: rows, error: null }
  } }, 42)
  assert.deepEqual(members.map(member => member.role), ['owner', 'viewer', 'editor'])
  assert.equal(rows[0].role, 'viewer')
})

test('empty response is safe', async () => {
  assert.deepEqual(await loadCollaborators({ rpc: async () => ({ data: null }) }, 42), [])
})

test('RPC errors and network failures propagate for retry', async () => {
  const error = new Error('Access denied')
  await assert.rejects(loadCollaborators({ rpc: async () => ({ error }) }, 42), error)
  await assert.rejects(loadCollaborators({ rpc: async () => { throw error } }, 42), error)
})

function membershipClient(response, calls = [], rpc = async () => ({ data: [] })) {
  const query = {
    update(patch) { calls.push(['update', patch]); return query },
    delete() { calls.push(['delete']); return query },
    eq(field, value) { calls.push(['eq', field, value]); return query },
    select(fields) { calls.push(['select', fields]); return Promise.resolve(response) },
  }
  return { from(table) { calls.push(['from', table]); return query }, rpc }
}
const viewer = { user_id: 'viewer-id', email: 'viewer@example.com', role: 'viewer' }

test('role update writes only role and scopes both identity columns', async () => {
  const calls = []
  await writeCollaborator(membershipClient({ data: [{ map_id: 42, user_id: viewer.user_id, role: 'editor' }] }, calls), 42, viewer, 'editor')
  assert.deepEqual(calls, [
    ['from', 'map_collaborators'], ['update', { role: 'editor' }],
    ['eq', 'map_id', 42], ['eq', 'user_id', viewer.user_id], ['select', 'map_id,user_id,role'],
  ])
})

test('removal deletes only membership with both identity filters', async () => {
  const calls = []
  await writeCollaborator(membershipClient({ data: [{ map_id: 42, ...viewer }] }, calls), 42, viewer, null)
  assert.deepEqual(calls.slice(0, 4), [
    ['from', 'map_collaborators'], ['delete'], ['eq', 'map_id', 42], ['eq', 'user_id', viewer.user_id],
  ])
})

test('owner and invalid roles are rejected before any query', async () => {
  const calls = []
  const client = membershipClient({}, calls)
  await assert.rejects(writeCollaborator(client, 42, { ...viewer, role: 'owner' }, null), /owner/)
  await assert.rejects(writeCollaborator(client, 42, viewer, 'owner'), /Invalid/)
  assert.deepEqual(calls, [])
})

test('denied, missing, mismatched or unconfirmed writes never count as success', async () => {
  for (const data of [[], null, [{ map_id: 99, user_id: viewer.user_id, role: 'editor' }],
    [{ map_id: 42, user_id: 'someone-else', role: 'editor' }],
    [{ map_id: 42, user_id: viewer.user_id, role: 'viewer' }]]) {
    await assert.rejects(writeCollaborator(membershipClient({ data }), 42, viewer, 'editor'), /could not be confirmed/)
  }
  await assert.rejects(writeCollaborator(membershipClient({ error: new Error('Denied') }), 42, viewer, null), /Denied/)
})

test('confirmed write precedes refetch; refresh failure is distinct from write failure', async () => {
  const events = []
  const client = membershipClient({ data: [{ map_id: 42, ...viewer }] }, [], async () => {
    events.push('refetch'); throw new Error('Offline')
  })
  const manager = createCollaboratorManager({ client, mapId: 42,
    onStatus: (_member, state) => events.push(state),
    onWrite: () => events.push('confirmed'), onMembers: () => events.push('members'),
  })
  await manager.run(viewer, null)
  assert.equal(events[1], 'confirmed')
  assert.equal(events[2], 'refetch')
  assert.equal(events.at(-1).refreshFailed, true)
  assert.match(events.at(-1).message, /Removal succeeded/)
})

test('failed write retains UI and does not refetch or announce success', async () => {
  const states = []
  const client = membershipClient({ error: new Error('Denied') }, [], () => assert.fail('Unexpected refetch'))
  const manager = createCollaboratorManager({ client, mapId: 42,
    onStatus: (_member, state) => states.push(state),
    onWrite: () => assert.fail('Unexpected UI update'), onMembers: () => assert.fail('Unexpected members'),
  })
  await manager.run(viewer, 'editor')
  assert.equal(states.at(-1).error, true)
  assert.equal(states.at(-1).message, 'Denied')
})

test('duplicate requests for a member are suppressed until refetch completes', async () => {
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  const calls = []
  const client = membershipClient(gate, calls, async () => ({ data: [viewer] }))
  const manager = createCollaboratorManager({ client, mapId: 42,
    onStatus() {}, onWrite() {}, onMembers() {},
  })
  const saving = manager.run(viewer, null)
  await manager.run(viewer, 'editor')
  assert.equal(calls.filter(call => call[0] === 'from').length, 1)
  finish({ data: [{ map_id: 42, ...viewer }] })
  await saving
})

test('disposed modal ignores late write completion and does not refetch', async () => {
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  const client = membershipClient(gate, [], () => assert.fail('Unexpected refetch'))
  const manager = createCollaboratorManager({ client, mapId: 42,
    onStatus() {}, onWrite: () => assert.fail('Late UI update'), onMembers() {},
  })
  const saving = manager.run(viewer, null)
  manager.dispose()
  finish({ data: [{ map_id: 42, ...viewer }] })
  await saving
})
