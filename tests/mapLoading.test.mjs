import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceLoader, readPins } from '../src/mapLoading.js'

function fixture() {
  const state = {
    maps: [
      { id: 1, user_id: 'user', name: 'All Places', is_default: true, color: '#333', sort_order: 0 },
      { id: 2, user_id: 'other', name: 'Shared', color: '#f00', sort_order: 1 },
    ],
    submaps: [{ id: 3, map_id: 2, name: 'Food', color: '#0f0', sort_order: 0 }],
    map_collaborators: [{ map_id: 2, user_id: 'user', role: 'editor' }],
    pins: [{ id: 12, user_id: 'other', name: 'Place', notes: 'Notes', longitude: 1, latitude: 2 }],
    pin_maps: [{ pin_id: 12, map_id: null, submap_id: 3 }],
    calls: [], fail: '', thrown: false, lostWrite: '', authFail: false,
  }
  const client = {
    auth: { async getUser() {
      state.calls.push(['auth', 'read'])
      if (state.authFail === 'throw') throw new TypeError('Network failed')
      return state.authFail ? { error: { message: 'private error' } } : { data: { user: { id: 'user' } } }
    } },
    from(table) {
      let write, single = false
      const filters = []
      return {
        select() { return this }, order() { return this }, in() { return this },
        eq(key, value) { filters.push([key, value]); return this },
        single() { single = true; return this },
        upsert(data, options) { write = data; state.calls.push([table, 'upsert', options]); return this },
        async then(resolve, reject) {
          try {
            if (write) {
              for (const row of write) {
                if (!state[table].some(old => old.name === row.name && (old.user_id === row.user_id || old.map_id === row.map_id))) {
                  state[table].push({ id: 100 + state[table].length, ...row })
                }
              }
              return resolve(state.lostWrite === table ? { error: { code: '08007' } } : { error: null })
            }
            state.calls.push([table, 'read'])
            if (state.fail === table) {
              if (state.thrown) throw new TypeError('private network details')
              return resolve({ error: { message: 'private database details' } })
            }
            const data = state[table].filter(row => filters.every(([key, value]) => row[key] === value))
            return resolve({ data: single ? data[0] : data, error: null })
          } catch (error) { return reject(error) }
        },
      }
    },
  }
  const loader = createWorkspaceLoader(client)
  let latest
  loader.subscribe(value => { latest = value })
  return { state, client, loader, latest: () => latest }
}

test('initial loading waits for all essential reads and publishes maps and pins together', async () => {
  const f = fixture()
  assert.equal(f.latest().status, 'loading')
  assert.equal(await f.loader.run(true), true)
  assert.equal(f.latest().status, 'ready')
  assert.equal(f.latest().data.maps[1].role, 'editor')
  assert.equal(f.latest().data.maps[1].submaps[0].name, 'Food')
  assert.deepEqual(f.latest().data.pins[0].maps, ['submap:3'])
  assert.equal(f.state.calls.some(([, operation]) => operation === 'upsert'), false)
})

test('each essential read failure reports an error instead of an empty workspace; Retry only reads', async () => {
  for (const table of ['maps', 'submaps', 'map_collaborators', 'pins', 'pin_maps']) {
    const f = fixture(); f.state.fail = table
    assert.equal(await f.loader.run(true), false)
    assert.equal(f.latest().status, 'error')
    assert.equal(f.latest().data, null)
    assert.doesNotMatch(f.latest().error, /private/)
    f.state.fail = ''
    assert.equal(await f.loader.run(), true)
    assert.equal(f.latest().status, 'ready')
    assert.equal(f.state.calls.some(([, operation]) => operation === 'upsert'), false)
  }
})

test('rejected read promises and authentication failures settle and can be retried', async () => {
  for (const authFail of [true, 'throw']) {
    const f = fixture(); f.state.authFail = authFail
    assert.equal(await f.loader.run(true), false)
    assert.equal(f.latest().status, 'error')
    f.state.authFail = false
    assert.equal(await f.loader.run(), true)
  }
  const f = fixture(); f.state.fail = 'pin_maps'; f.state.thrown = true
  assert.equal(await f.loader.run(true), false)
  assert.equal(f.latest().status, 'error')
  f.state.fail = ''
  assert.equal(await f.loader.run(), true)
})

test('null responses and unexpected normalization errors do not leave loading stuck', async () => {
  for (const data of [null, [null]]) {
    const f = fixture(); f.state.submaps = data
    assert.equal(await f.loader.run(true), false)
    assert.equal(f.latest().status, 'error')
    f.state.submaps = []
    assert.equal(await f.loader.run(), true)
  }
})

test('a successful empty pin result is valid and does not request memberships', async () => {
  const f = fixture(); f.state.pins = []
  assert.equal(await f.loader.run(true), true)
  assert.deepEqual(f.latest().data.pins, [])
  assert.equal(f.state.calls.some(([table]) => table === 'pin_maps'), false)
})

test('failed refresh retains the last successful snapshot until a complete retry succeeds', async () => {
  const f = fixture(); await f.loader.run(true)
  const data = f.latest().data
  f.state.maps[1] = { ...f.state.maps[1], name: 'Changed remotely' }
  f.state.fail = 'pins'
  assert.equal(await f.loader.run(), false)
  assert.equal(f.latest().data, data)
  assert.equal(f.latest().data.maps[1].name, 'Shared')
  f.state.fail = ''
  await f.loader.run()
  assert.equal(f.latest().data.maps[1].name, 'Changed remotely')
})

test('first-account setup uses existing conflict keys and runs once across subsequent loads', async () => {
  const f = fixture(); f.state.maps = []; f.state.submaps = []; f.state.pins = []
  assert.equal(await f.loader.run(true), true)
  const writes = f.state.calls.filter(([, op]) => op === 'upsert')
  assert.deepEqual(writes.map(call => call[2]), [
    { onConflict: 'user_id,name', ignoreDuplicates: true },
    { onConflict: 'map_id,name', ignoreDuplicates: true },
  ])
  assert.equal(f.latest().data.maps.length, 3)
  assert.equal(f.latest().data.maps.find(map => map.name === 'Family').submaps.length, 3)
  await f.loader.run(true)
  await f.loader.run()
  assert.equal(f.state.calls.filter(([, op]) => op === 'upsert').length, 2)
})

test('lost setup write responses are never replayed by Retry, even after partial setup', async () => {
  for (const table of ['maps', 'submaps']) {
    const f = fixture(); f.state.maps = []; f.state.submaps = []; f.state.pins = []
    f.state.lostWrite = table
    assert.equal(await f.loader.run(true), false)
    assert.match(f.latest().error, /without repeating setup/)
    const count = f.state.calls.filter(([, op]) => op === 'upsert').length
    assert.equal(await f.loader.run(), true)
    assert.equal(f.state.calls.filter(([, op]) => op === 'upsert').length, count)
  }
})

test('read-only Retry does not turn a missing initial setup into a misleading empty success', async () => {
  const f = fixture(); f.state.maps = []; f.state.authFail = true
  await f.loader.run(true)
  f.state.authFail = false
  assert.equal(await f.loader.run(), false)
  assert.match(f.latest().error, /initial map setup/)
  assert.equal(f.state.calls.some(([, op]) => op === 'upsert'), false)
})

test('duplicate loads share a request and a replacement subscriber receives its completion', async () => {
  const f = fixture()
  let release
  const original = f.client.auth.getUser
  f.client.auth.getUser = () => new Promise(resolve => { release = () => original().then(resolve) })
  const first = f.loader.run()
  const second = f.loader.run(true)
  assert.equal(first, second)
  await Promise.resolve()
  let oldCalls = 0, replacement
  const unsubscribe = f.loader.subscribe(() => { oldCalls++ })
  unsubscribe()
  f.loader.subscribe(state => { replacement = state })
  release()
  await first
  assert.equal(oldCalls, 1)
  assert.equal(replacement.status, 'ready')
})

test('failed pin refreshes can report a retained-data warning and read-only recovery', async () => {
  const f = fixture(); await f.loader.run(true)
  const data = f.latest().data
  f.loader.reportFailure()
  assert.equal(f.latest().data, data)
  assert.match(f.latest().error, /out of date/)
  assert.equal(await f.loader.run(), true)
})

test('readPins rejects missing or malformed membership responses rather than trusting cached connections', async () => {
  const f = fixture()
  for (const links of [null, [{}], [{ pin_id: 12, map_id: 2, submap_id: 3 }]]) {
    f.state.pin_maps = links
    await assert.rejects(readPins(f.client))
  }
})
