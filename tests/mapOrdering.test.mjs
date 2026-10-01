import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPersonalOrder, createOrderQueue, moveWithinList, orderBatch, pinColor, positionsFor } from '../src/mapOrdering.js'

const maps = () => [
  { id: 1, isDefault: true, sortOrder: 9, color: 'black', submaps: [] },
  { id: 2, sortOrder: 0, color: 'red', role: 'viewer', submaps: [
    { id: 21, sortOrder: 2, color: 'orange' },
    { id: 22, sortOrder: 1, color: 'yellow' },
  ] },
  { id: 3, sortOrder: 1, color: 'blue', role: 'editor', submaps: [{ id: 31, sortOrder: 0, color: 'green' }] },
]
const empty = { maps: {}, submaps: {} }

test('parent batches target only personal table and exclude All Places, duplicates, missing IDs', () => {
  assert.deepEqual(orderBatch('account-a', null, [1, 3, 3, 2, 999], maps()), {
    table: 'user_map_order', onConflict: 'user_id,map_id', rows: [
      { user_id: 'account-a', map_id: 3, sort_order: 0 },
      { user_id: 'account-a', map_id: 2, sort_order: 1 },
    ],
  })
})

test('submap batches exclude foreign siblings and never write parent or ownership data', () => {
  assert.deepEqual(orderBatch('account-b', 2, [31, 21, 22], maps()), {
    table: 'user_submap_order', onConflict: 'user_id,submap_id', rows: [
      { user_id: 'account-b', submap_id: 21, sort_order: 0 },
      { user_id: 'account-b', submap_id: 22, sort_order: 1 },
    ],
  })
})

test('fallback orders are deterministic, nulls last, All Places always first', () => {
  const input = [...maps(), { id: 5, sortOrder: null, submaps: [] }, { id: 4, sortOrder: 1, submaps: [] }]
  const output = applyPersonalOrder(input, empty)
  assert.deepEqual(output.map(map => map.id), [1, 2, 3, 4, 5])
  assert.deepEqual(output[1].submaps.map(submap => submap.id), [22, 21])
  assert.deepEqual(input[1].submaps.map(submap => submap.id), [21, 22])
})

test('personal order overrides fallback, unknown IDs ignored, unordered new items append', () => {
  const input = maps()
  const output = applyPersonalOrder(input, { maps: { 3: 0, 999: 1 }, submaps: { 21: 0, 22: 1 } })
  assert.deepEqual(output.map(map => map.id), [1, 3, 2])
  assert.deepEqual(output[2].submaps.map(submap => submap.id), [21, 22])
  assert.deepEqual(input.map(map => map.id), [1, 2, 3])
  assert.equal(output[2].role, 'viewer')
})

test('move rejects foreign IDs and no-op moves and preserves membership', () => {
  const ids = [21, 22]
  assert.equal(moveWithinList(ids, 21, 31), ids)
  assert.equal(moveWithinList(ids, 21, 21), ids)
  assert.deepEqual(moveWithinList(ids, 21, 22), [22, 21])
  assert.deepEqual(moveWithinList([2, 3, 4], 4, 2), [4, 2, 3])
  assert.deepEqual(positionsFor([3, 2]), { 3: 0, 2: 1 })
})

test('parent order controls marker priority independent of connection ordering', () => {
  const pin = { maps: ['map:3', 'map:1', 'map:2'] }
  assert.equal(pinColor(pin, applyPersonalOrder(maps(), empty)), 'red')
  assert.equal(pinColor(pin, applyPersonalOrder(maps(), { ...empty, maps: { 3: 0, 2: 1 } })), 'blue')
})

test('submap overrides direct connection within winning parent', () => {
  const pin = { maps: ['map:3', 'map:2', 'submap:21'] }
  assert.equal(pinColor(pin, applyPersonalOrder(maps(), empty)), 'orange')
})

test('sibling personal order controls which applicable submap supplies color', () => {
  const input = maps()
  input[1].submaps.push({ id: 23, sortOrder: 3, color: 'purple' })
  const pin = { maps: ['submap:21', 'submap:22'] }
  assert.equal(pinColor(pin, applyPersonalOrder(input, empty)), 'yellow')
  assert.equal(pinColor(pin, applyPersonalOrder(input, { ...empty, submaps: { 21: 0, 22: 1 } })), 'orange')
})

test('one of several submaps supplies its color without a direct parent connection', () => {
  assert.equal(pinColor({ maps: ['submap:21'] }, maps()), 'orange')
})

test('all loaded siblings use parent color regardless of direct connection or sibling order', () => {
  for (const connections of [
    ['submap:21', 'submap:22'],
    ['map:2', 'submap:21', 'submap:22', 'submap:21'],
  ]) {
    const pin = { maps: connections }
    assert.equal(pinColor(pin, applyPersonalOrder(maps(), empty)), 'red')
    assert.equal(pinColor(pin, applyPersonalOrder(maps(), { ...empty, submaps: { 21: 0, 22: 1 } })), 'red')
  }
  // A parent with one existing submap also qualifies when that submap applies.
  assert.equal(pinColor({ maps: ['submap:31'] }, maps()), 'blue')
})

test('zero-submap parent requires a direct connection and cannot win vacuously', () => {
  const input = maps()
  input[1].submaps = []
  assert.equal(pinColor({ maps: ['map:2'] }, input), 'red')
  assert.equal(pinColor({ maps: ['map:3'] }, input), 'blue')
  assert.equal(pinColor({ maps: [] }, input), '#3388ff')
})

test('all-submaps check is scoped to the winning loaded parent and honors personal parent order', () => {
  const pin = { maps: ['submap:21', 'submap:22', 'submap:31'] }
  assert.equal(pinColor(pin, applyPersonalOrder(maps(), empty)), 'red')
  assert.equal(pinColor(pin, applyPersonalOrder(maps(), { ...empty, maps: { 3: 0, 2: 1 } })), 'blue')
  // Connections to unrelated submaps cannot substitute for a missing sibling.
  assert.equal(pinColor({ maps: ['submap:21', 'submap:31', 'submap:999'] }, maps()), 'orange')
})

test('All Places never supplies color even when all its submaps apply', () => {
  const input = maps()
  input[0].submaps = [{ id: 10, color: 'pink' }]
  assert.equal(pinColor({ maps: ['map:1', 'submap:10', 'submap:21'] }, input), 'orange')
  assert.equal(pinColor({ maps: ['map:1', 'submap:10'] }, input), '#3388ff')
})

test('higher parent direct color beats a lower parent submap', () => {
  assert.equal(pinColor({ maps: ['submap:31', 'map:2'] }, applyPersonalOrder(maps(), empty)), 'red')
})

test('All Places and missing connections never supply marker colors', () => {
  assert.equal(pinColor({ maps: ['map:1'] }, maps()), '#3388ff')
  assert.equal(pinColor({ maps: ['map:999', 'submap:999'] }, maps()), '#3388ff')
})

test('two accounts can independently order the same shared pins', () => {
  const pin = { maps: ['map:2', 'map:3'] }
  const accountA = applyPersonalOrder(maps(), { ...empty, maps: { 2: 0, 3: 1 } })
  const accountB = applyPersonalOrder(maps(), { ...empty, maps: { 3: 0, 2: 1 } })
  assert.equal(pinColor(pin, accountA), 'red')
  assert.equal(pinColor(pin, accountB), 'blue')
})

test('failed batches keep latest list queued and retry without rollback', async () => {
  const calls = []
  const states = []
  let fail = true
  const queue = createOrderQueue(async value => {
    calls.push(value)
    if (fail) throw Error('offline')
  }, state => states.push(state))
  await queue.enqueue('maps', { ids: [2, 3] })
  assert.equal(states.at(-1), 'error')
  await queue.enqueue('maps', { ids: [3, 2] })
  fail = false
  await queue.retry()
  assert.deepEqual(calls.at(-1), { ids: [3, 2] })
  assert.equal(states.at(-1), 'saved')
})

test('rapid batches serialize and preserve the latest edit plus other sibling groups', async () => {
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  const calls = []
  const queue = createOrderQueue(async value => {
    calls.push(value)
    if (calls.length === 1) await gate
  }, () => {})
  const saving = queue.enqueue('maps', [2, 3])
  await queue.enqueue('maps', [3, 2])
  await queue.enqueue('submaps:2', [22, 21])
  finish()
  await saving
  assert.deepEqual(calls, [[2, 3], [3, 2], [22, 21]])
})

test('disposed queue ignores late success and refuses further writes', async () => {
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  const states = []
  let calls = 0
  const queue = createOrderQueue(async () => { calls++; await gate }, state => states.push(state))
  const saving = queue.enqueue('maps', [2, 3])
  queue.dispose()
  finish()
  await saving
  await queue.enqueue('maps', [3, 2])
  assert.equal(calls, 1)
  assert.deepEqual(states, ['saving'])
})
