import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCollaborators } from '../src/collaborators.js'

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
