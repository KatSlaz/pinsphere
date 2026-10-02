import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invitationStatus, readInvitations, removeSentInvitation } from '../src/invitations.js'

test('deadline expiration is immediate and history status stays intact', () => {
  const deadline = '2026-10-01T12:00:00Z'
  const now = Date.parse(deadline)
  assert.equal(invitationStatus({ status: 'pending', expires_at: deadline }, now - 1), 'pending')
  assert.equal(invitationStatus({ status: 'pending', expires_at: deadline }, now), 'expired')
  for (const status of ['accepted', 'declined', 'expired']) {
    assert.equal(invitationStatus({ status, expires_at: deadline }, now + 1), status)
  }
  for (const expires_at of [null, 'invalid']) {
    assert.equal(invitationStatus({ status: 'pending', expires_at }, now), 'expired')
  }
})

function deletionClient(result, calls) {
  const query = {
    delete() { calls.push('delete'); return query },
    eq(key, value) { calls.push([key, value]); return query },
    select(fields) { calls.push(['select', fields]); return Promise.resolve(result) },
  }
  return { from(table) { calls.push(table); return query } }
}

test('removal targets only the sender invitation record and confirms deletion', async () => {
  const calls = []
  await removeSentInvitation(deletionClient({ data: [{ id: 7 }] }, calls), 'sender', 7)
  assert.deepEqual(calls, ['map_invitations', 'delete', ['id', 7], ['inviter_id', 'sender'], ['select', 'id']])
})

test('blocked, missing and failed deletion do not report success', async () => {
  for (const data of [null, [], [{ id: 8 }]]) {
    await assert.rejects(removeSentInvitation(deletionClient({ data }, []), 'sender', 7), /could not be confirmed/)
  }
  await assert.rejects(removeSentInvitation(deletionClient({ error: new Error('Offline') }, []), 'sender', 7), /Offline/)
})

test('refresh loads role/history and preserves independent section failures', async () => {
  const query = {
    select(fields) { assert.match(fields, /role,status/); return query },
    eq(key, value) { assert.equal(key, 'inviter_id'); assert.equal(value, 'sender'); return query },
    order() { return Promise.resolve({ data: [{ id: 7, role: 'editor', status: 'accepted' }] }) },
  }
  const client = {
    rpc: async name => { assert.equal(name, 'get_received_map_invitations'); throw new Error('Offline') },
    from: table => { assert.equal(table, 'map_invitations'); return query },
  }
  const [received, sent] = await readInvitations(client, 'sender')
  assert.match(received.error.message, /Offline/)
  assert.equal(sent.data[0].role, 'editor')
  assert.equal(sent.data[0].status, 'accepted')
})
