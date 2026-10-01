import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachePreferences, createPreferenceSync, readLocalPreferences } from '../src/preferences.js'

const defaults = { theme: 'system', map_style: 'fiord' }
const remote = { id: 'user-a', theme: 'dark', map_style: 'positron' }
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function setup(steps, local = defaults) {
  const calls = []
  const applied = []
  const statuses = []
  function next(operation, payload) {
    calls.push({ operation, payload })
    const step = steps.shift()
    assert.equal(step.operation, operation)
    return typeof step.result === 'function' ? step.result() : Promise.resolve(step.result)
  }
  const client = {
    from(table) {
      assert.equal(table, 'profiles')
      return {
        select(fields) {
          assert.equal(fields, 'id,theme,map_style')
          return { eq(column, id) {
            assert.equal(column, 'id')
            assert.equal(id, 'user-a')
            return { maybeSingle: () => next('read') }
          } }
        },
        insert: payload => next('insert', payload),
        update(payload) {
          return { eq(column, id) {
            assert.equal(column, 'id')
            assert.equal(id, 'user-a')
            return { select(fields) {
              assert.equal(fields, 'id,theme,map_style')
              return { single: () => next('update', payload) }
            } }
          } }
        },
      }
    },
  }
  const sync = createPreferenceSync({
    client, userId: 'user-a', readLocal: () => local,
    onPreferences: value => applied.push(value), onStatus: value => statuses.push(value),
  })
  return { sync, calls, applied, statuses }
}

test('local validation uses defaults for absent/invalid values and preserves valid choices', () => {
  assert.deepEqual(readLocalPreferences({ getItem: () => null }), defaults)
  assert.deepEqual(readLocalPreferences({ getItem: () => 'invalid' }), defaults)
  const values = new Map([['pinsphere-theme', 'light'], ['pinsphere-map-style', 'bright']])
  assert.deepEqual(readLocalPreferences({ getItem: key => values.get(key) }), { theme: 'light', map_style: 'bright' })
  assert.deepEqual(readLocalPreferences({ getItem() { throw Error('blocked') } }), defaults)
  assert.doesNotThrow(() => cachePreferences({ setItem() { throw Error('blocked') } }, defaults))
})

test('first login inserts local preferences without username and then reads account', async () => {
  const local = { theme: 'light', map_style: 'liberty' }
  const s = setup([
    { operation: 'read', result: { data: null } },
    { operation: 'insert', result: {} },
    { operation: 'read', result: { data: { id: 'user-a', ...local } } },
  ], local)
  await s.sync.start()
  assert.deepEqual(s.calls[1].payload, { id: 'user-a', ...local })
  assert.deepEqual(s.applied, [local])
  assert.equal(s.statuses.at(-1), 'saved')
})

test('losing initialization race loads winner without updating it', async () => {
  const s = setup([
    { operation: 'read', result: { data: null } },
    { operation: 'insert', result: { error: { code: '23505' } } },
    { operation: 'read', result: { data: remote } },
  ])
  await s.sync.start()
  assert.deepEqual(s.applied, [{ theme: 'dark', map_style: 'positron' }])
  assert.equal(s.calls.some(call => call.operation === 'update'), false)
})

test('existing account wins without insertion', async () => {
  const s = setup([{ operation: 'read', result: { data: remote } }])
  await s.sync.start()
  assert.deepEqual(s.applied, [{ theme: 'dark', map_style: 'positron' }])
  assert.equal(s.calls.length, 1)
})

test('edit during initial load survives hydration and writes only edited field', async () => {
  const load = deferred()
  const s = setup([
    { operation: 'read', result: () => load.promise },
    { operation: 'update', result: { data: remote } },
  ])
  const loading = s.sync.start()
  await s.sync.change({ theme: 'light' })
  load.resolve({ data: remote })
  await loading
  assert.deepEqual(s.applied, [{ theme: 'light', map_style: 'positron' }])
  assert.deepEqual(s.calls[1].payload, { theme: 'light' })
})

test('rapid writes are serialized and old responses do not reapply preferences', async () => {
  const write = deferred()
  const s = setup([
    { operation: 'read', result: { data: remote } },
    { operation: 'update', result: () => write.promise },
    { operation: 'update', result: { data: remote } },
  ])
  await s.sync.start()
  const saving = s.sync.change({ theme: 'light' })
  await s.sync.change({ theme: 'system', map_style: 'bright' })
  write.resolve({ data: remote })
  await saving
  assert.deepEqual(s.calls.slice(1).map(call => call.payload), [
    { theme: 'light' }, { theme: 'system', map_style: 'bright' },
  ])
  assert.equal(s.applied.length, 1)
})

test('failed writes retain pending edits and retry saves them', async () => {
  const s = setup([
    { operation: 'read', result: { data: remote } },
    { operation: 'update', result: { error: { message: 'offline' } } },
    { operation: 'update', result: { data: remote } },
  ])
  await s.sync.start()
  await s.sync.change({ map_style: 'liberty' })
  assert.equal(s.statuses.at(-1), 'error')
  assert.deepEqual(s.sync.getPending(), { map_style: 'liberty' })
  await s.sync.retry()
  assert.equal(s.statuses.at(-1), 'saved')
  assert.deepEqual(s.calls[2].payload, { map_style: 'liberty' })
})

test('failed reads do not insert or overwrite local preferences and can retry', async () => {
  const s = setup([
    { operation: 'read', result: { error: { message: 'offline' } } },
    { operation: 'read', result: { data: remote } },
  ])
  await s.sync.start()
  assert.deepEqual(s.applied, [])
  assert.equal(s.statuses.at(-1), 'error')
  await s.sync.retry()
  assert.equal(s.applied.length, 1)
})

test('logout/account switch ignores late load completion', async () => {
  const load = deferred()
  const s = setup([{ operation: 'read', result: () => load.promise }])
  const loading = s.sync.start()
  s.sync.dispose()
  load.resolve({ data: remote })
  await loading
  assert.deepEqual(s.applied, [])
  assert.equal(s.statuses.at(-1), 'syncing')
})

test('logout before missing-row read completes never inserts a profile', async () => {
  const load = deferred()
  const s = setup([{ operation: 'read', result: () => load.promise }])
  const loading = s.sync.start()
  s.sync.dispose()
  load.resolve({ data: null })
  await loading
  assert.equal(s.calls.length, 1)
})

test('thrown network failures retain edits for retry', async () => {
  const s = setup([
    { operation: 'read', result: { data: remote } },
    { operation: 'update', result: () => Promise.reject(Error('network')) },
    { operation: 'update', result: { data: remote } },
  ])
  await s.sync.start()
  await s.sync.change({ theme: 'light' })
  assert.equal(s.statuses.at(-1), 'error')
  await s.sync.retry()
  assert.deepEqual(s.calls[2].payload, { theme: 'light' })
  assert.equal(s.statuses.at(-1), 'saved')
})
