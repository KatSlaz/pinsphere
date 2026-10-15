import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canSuggest, createPlaceSearch, normalizePlaces, normalizeQuery, pinDraftFromPlace, searchContext } from '../src/placeSearch.js'

const place = (overrides = {}) => ({ place_id: 'a', name: "McDonald's", address_line2: '10 Main St, Atlanta', lat: 33.75, lon: -84.39, result_type: 'amenity', ...overrides })
const response = results => ({ ok: true, json: async () => ({ results }) })
function harness(fetcher, extra = {}) {
  const states = [], timers = new Map()
  let id = 0, time = 0
  const controller = createPlaceSearch({ key: 'test-key', fetcher, onState: state => states.push(state),
    now: () => time,
    setTimer(fn, ms) { timers.set(++id, { fn, ms }); return id },
    clearTimer(timer) { timers.delete(timer) }, ...extra })
  return { controller, states, timers, advance(ms) { time += ms },
    async fire(ms) { for (const [key, timer] of [...timers]) if (timer.ms === ms) { timers.delete(key); await timer.fn() } },
  }
}

test('queries normalize whitespace/Unicode and count meaningful international characters', () => {
  assert.equal(normalizeQuery('  Cafe\u0301  Tokyo  '), 'Café Tokyo')
  assert.equal(canSuggest('...'), false)
  assert.equal(canSuggest('a b'), false)
  assert.equal(canSuggest('東京駅'), true)
  assert.equal(canSuggest('東京'), false)
  assert.equal(canSuggest('東京1'), true)
})

test('normalization drops invalid coordinates, retains metadata and flags broad results', () => {
  const results = normalizePlaces({ results: [place(), place({ place_id: 'bad', lat: null }),
    place({ place_id: 'bad2', lon: 181 }), place({ place_id: 'city', name: 'Paris', lat: 48.85, lon: 2.35,
      address_line2: 'France', result_type: 'city', bbox: { lon1: 2.2, lat1: 48.8, lon2: 2.5, lat2: 48.9 } })] })
  assert.equal(results.length, 2)
  assert.equal(results[0].isArea, false)
  assert.equal(results[1].isArea, true)
  assert.deepEqual(results[1].bounds, [2.2, 48.8, 2.5, 48.9])
  assert.deepEqual(pinDraftFromPlace(results[0]), { longitude: -84.39, latitude: 33.75, name: "McDonald's" })
  assert.throws(() => normalizePlaces({ unexpected: [] }))
})

test('deduplication merges venue representations without merging different chain branches', () => {
  const results = normalizePlaces({ results: [place(), place({ place_id: 'b', lat: 33.7501 }),
    place({ place_id: 'c', address_line2: '20 Main St, Atlanta', lat: 33.751 })] })
  assert.equal(results.length, 2)
})

test('common address abbreviations deduplicate nearby representations, but not separate addresses', () => {
  const results = normalizePlaces({ results: [place({ address_line2: '2720 Northwest 29th Avenue, Portland' }),
    place({ place_id: 'b', address_line2: '2720 NW 29th Ave, Portland', lat: 33.7501 }),
    place({ place_id: 'c', address_line2: '2722 NW 29th Ave, Portland', lat: 33.7501 })] })
  assert.equal(results.length, 2)
})

test('proximity is coarse and only enabled at local zoom', () => {
  assert.equal(searchContext(null), null)
  assert.equal(searchContext({ getZoom: () => 2 }), null)
  assert.deepEqual(searchContext({ getZoom: () => 10, getCenter: () => ({ lng: -84.39123, lat: 33.75123 }) }),
    { longitude: -84.39, latitude: 33.75 })
})

test('typing is debounced for 400ms and insufficient input makes no request', async () => {
  const calls = []
  const h = harness(async url => { calls.push(url); return response([place()]) })
  h.controller.search('ab')
  assert.equal(h.timers.size, 0)
  h.controller.search('Sta')
  h.controller.search('Starbucks Tokyo')
  assert.equal(h.timers.size, 1)
  assert.equal(calls.length, 0)
  await h.fire(400)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].pathname, '/v1/geocode/autocomplete')
  assert.equal(calls[0].searchParams.get('limit'), '10')
  assert.equal(calls[0].searchParams.get('bias'), 'countrycode:none')
  assert.equal(h.states.at(-1).status, 'ready')
})

test('Enter cancels the scheduled autocomplete and runs only forward worldwide search', async () => {
  const calls = []
  const h = harness(async url => { calls.push(url); return response([]) })
  h.controller.search('Paris')
  await h.controller.search('Paris', 'forward', { longitude: 100, latitude: 20 })
  await h.fire(400)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].pathname, '/v1/geocode/search')
  assert.equal(calls[0].searchParams.get('bias'), 'countrycode:none')
  assert.deepEqual(h.states.at(-1).results, [])
})

test('outdated responses are ignored even if the transport ignores abort', async () => {
  const pending = []
  const h = harness((url, options) => new Promise(resolve => pending.push({ resolve, options, url })))
  const first = h.controller.search('Old place', 'forward')
  const second = h.controller.search('New place', 'forward')
  assert.equal(pending[0].options.signal.aborted, true)
  pending[1].resolve(response([place({ name: 'New' })])); await second
  pending[0].resolve(response([place({ name: 'Old' })])); await first
  assert.equal(h.states.at(-1).results[0].name, 'New')
})

test('cache reuses recent results, separates contexts and expires', async () => {
  let calls = 0
  const h = harness(async () => { calls++; return response([]) })
  await h.controller.search('Paris', 'forward')
  await h.controller.search('  PARIS ', 'forward')
  assert.equal(calls, 1)
  h.controller.search('Paris', 'autocomplete', { latitude: 33, longitude: -84 }); await h.fire(400)
  assert.equal(calls, 2)
  h.advance(300001)
  await h.controller.search('Paris', 'forward')
  assert.equal(calls, 3)
})

test('quota/config/network errors are safe and never retry or expose URLs/keys', async () => {
  for (const status of [429, 403, 500]) {
    let calls = 0
    const h = harness(async () => { calls++; return { ok: false, status } })
    await h.controller.search('Paris', 'forward')
    assert.equal(h.states.at(-1).status, 'error')
    assert.doesNotMatch(h.states.at(-1).error, /test-key|https:/)
    assert.equal(calls, 1)
  }
  const network = harness(async () => { throw new Error('url containing test-key') })
  await network.controller.search('Paris', 'forward')
  assert.doesNotMatch(network.states.at(-1).error, /test-key/)
  const missing = harness(() => assert.fail('No request expected'), { key: '' })
  await missing.controller.search('Paris', 'forward')
  assert.match(missing.states.at(-1).error, /not configured/)
})

test('dismiss/disposal cancel pending requests and ignore late selection results', async () => {
  let resolve
  const h = harness(() => new Promise(done => { resolve = done }))
  const request = h.controller.search('Paris', 'forward')
  const count = h.states.length
  h.controller.dispose()
  resolve(response([place()])); await request
  assert.equal(h.states.length, count)
})

test('timeout aborts once, shows recoverable feedback, and does not retry', async () => {
  let calls = 0
  const h = harness((_url, { signal }) => new Promise((_resolve, reject) => {
    calls++
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const request = h.controller.search('Paris', 'forward')
  await h.fire(12000)
  await request
  assert.equal(calls, 1)
  assert.match(h.states.at(-1).error, /too long/)
})
