export const normalizeQuery = value => value.normalize('NFC').trim().replace(/\s+/gu, ' ')
export const canSuggest = value => (normalizeQuery(value).match(/[\p{L}\p{N}]/gu) || []).length >= 3
const areaTypes = new Set(['country', 'state', 'city', 'county', 'district', 'postcode', 'suburb', 'street'])

export function normalizePlaces(body) {
  const items = body.results || body.features?.map(feature => ({ ...feature.properties, bbox: feature.bbox || feature.properties.bbox }))
  if (!Array.isArray(items)) throw new Error('invalid-response')
  const results = []
  for (const place of items) {
    if (place.lat == null || place.lon == null) continue
    const latitude = Number(place.lat), longitude = Number(place.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue
    const name = place.name || place.address_line1 || place.formatted
    if (!name) continue
    const address = place.address_line2 || place.formatted || [place.city, place.state, place.country].filter(Boolean).join(', ')
    const box = place.bbox
    const values = Array.isArray(box) ? box : box && [box.lon1, box.lat1, box.lon2, box.lat2]
    const bounds = values?.length === 4 && values.every(Number.isFinite)
      && values[0] < values[2] && values[1] < values[3]
      && values[0] >= -180 && values[2] <= 180 && values[1] >= -90 && values[3] <= 90 ? values : null
    const normalizedName = normalizeQuery(name).toLocaleLowerCase()
    // Venue/building representations may have different provider IDs and coordinates.
    // Merge only very close same-name/address records, not separate chain branches.
    const addressKey = address.toLocaleLowerCase()
      .replace(/\b(northwest|northeast|southwest|southeast)\b/gu, word => ({ northwest: 'nw', northeast: 'ne', southwest: 'sw', southeast: 'se' }[word]))
      .replace(/\b(street|avenue|boulevard|road)\b/gu, word => ({ street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd' }[word]))
      .replace(/[^\p{L}\p{N}]/gu, '')
    if (results.some(result => result.id === place.place_id && place.place_id
      || (result.name.toLocaleLowerCase() === normalizedName && result.addressKey === addressKey
        && Math.abs(result.latitude - latitude) < 0.0005 && Math.abs(result.longitude - longitude) < 0.0005))) continue
    results.push({ id: place.place_id || `${longitude},${latitude}:${name}`, name, address, addressKey,
      latitude, longitude, bounds, type: place.result_type || 'place', isArea: areaTypes.has(place.result_type) })
  }
  return results.slice(0, 10)
}

export function searchContext(map) {
  if (!map || map.getZoom() < 9) return null
  const center = map.getCenter()
  // A coarse context improves cache reuse and avoids needless GPS precision.
  return { longitude: Number(center.lng.toFixed(2)), latitude: Number(center.lat.toFixed(2)) }
}

export function pinDraftFromPlace(place) {
  return { longitude: place.longitude, latitude: place.latitude, name: place.name }
}

export function createPlaceSearch({ key, onState, fetcher = fetch, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let generation = 0, timer, controller, disposed = false
  const cache = new Map()
  function cancel() {
    generation++
    clearTimer(timer)
    controller?.abort()
  }
  async function request(query, mode, context) {
    const requestId = generation
    const text = normalizeQuery(query)
    if (!key) { onState({ status: 'error', results: [], error: 'Search is not configured. You can still place a pin manually.' }); return }
    const bias = mode === 'autocomplete' && context
      ? `countrycode:none|proximity:${context.longitude},${context.latitude}` : 'countrycode:none'
    const cacheKey = JSON.stringify([mode, text.toLocaleLowerCase(), bias])
    const saved = cache.get(cacheKey)
    if (saved && now() - saved.time < 300000) { onState({ status: 'ready', results: saved.results }); return }
    controller = new AbortController()
    const active = controller
    let timedOut = false
    const timeout = setTimer(() => { timedOut = true; active.abort() }, 12000)
    onState({ status: 'loading', results: [] })
    try {
      const url = new URL(`https://api.geoapify.com/v1/geocode/${mode === 'autocomplete' ? 'autocomplete' : 'search'}`)
      url.search = new URLSearchParams({ apiKey: key, text, limit: '10', format: 'json', bias })
      const response = await fetcher(url, { signal: active.signal, referrerPolicy: 'strict-origin-when-cross-origin' })
      if (!response.ok) {
        const error = new Error('http-error'); error.status = response.status; throw error
      }
      const results = normalizePlaces(await response.json())
      if (disposed || requestId !== generation) return
      cache.delete(cacheKey)
      cache.set(cacheKey, { time: now(), results })
      if (cache.size > 30) cache.delete(cache.keys().next().value)
      onState({ status: 'ready', results })
    } catch (error) {
      if (disposed || requestId !== generation) return
      if (error.name === 'AbortError' && !timedOut) return
      const message = error.status === 429 || error.status === 402 ? 'Search limit reached. Please try later or place a pin manually.'
        : error.status === 401 || error.status === 403 ? 'Search is unavailable with the current API configuration. You can place a pin manually.'
        : timedOut ? 'Search took too long. Please try again or place a pin manually.'
        : 'Could not search for places. Please try again or place a pin manually.'
      // Never surface provider error text or request URLs containing the key.
      onState({ status: 'error', results: [], error: message })
    } finally { clearTimer(timeout) }
  }
  return {
    search(query, mode = 'autocomplete', context = null) {
      if (disposed) return
      cancel()
      const text = normalizeQuery(query)
      if (mode === 'autocomplete' && !canSuggest(text) || !text) {
        onState({ status: 'idle', results: [] }); return
      }
      onState({ status: mode === 'autocomplete' ? 'waiting' : 'loading', results: [] })
      if (mode === 'autocomplete') timer = setTimer(() => request(text, mode, context), 400)
      else return request(text, mode, null)
    },
    cancel,
    dispose() { disposed = true; cancel(); cache.clear() },
  }
}
