const rows = result => {
  if (result.error || !Array.isArray(result.data)) throw new Error('read-failed')
  return result.data
}

async function readUser(client) {
  const result = await client.auth.getUser()
  if (result.error || !result.data?.user) throw new Error('read-failed')
  return result.data.user.id
}

export async function readPins(client) {
  const pins = rows(await client.from('pins').select('*'))
  if (!pins.length) return []
  const connections = rows(await client.from('pin_maps').select('*').in('pin_id', pins.map(pin => pin.id)))
  if (connections.some(row => row.pin_id == null || (row.map_id == null) === (row.submap_id == null))) {
    throw new Error('read-failed')
  }
  return pins.map(pin => ({
    id: pin.id, userId: pin.user_id, name: pin.name,
    longitude: pin.longitude, latitude: pin.latitude, notes: pin.notes || '',
    maps: connections.filter(row => row.pin_id === pin.id)
      .map(row => row.map_id != null ? `map:${row.map_id}` : `submap:${row.submap_id}`),
  }))
}

const ownAllPlaces = (map, userId) => map.user_id === userId && map.is_default === true && map.name === 'All Places'

// Existing first-account setup, kept separate from all read retries. Upserts
// retain the existing conflict keys and do not overwrite existing collections.
async function initializeDefaultMaps(client) {
  const userId = await readUser(client)
  const maps = rows(await client.from('maps').select('*').order('sort_order', { ascending: true }))
  if (maps.some(map => ownAllPlaces(map, userId))) return
  const inserted = await client.from('maps').upsert([
    { user_id: userId, name: 'All Places', color: '#333', is_default: true, sort_order: 0 },
    { user_id: userId, name: 'My places', color: '#ff0000', is_default: false, sort_order: 1 },
    { user_id: userId, name: 'Family', color: '#007ba0', is_default: false, sort_order: 2 },
  ], { onConflict: 'user_id,name', ignoreDuplicates: true })
  if (inserted.error) throw new Error('setup-failed')
  const family = await client.from('maps').select('*').eq('user_id', userId).eq('name', 'Family').single()
  if (family.error || !family.data) throw new Error('setup-failed')
  const children = await client.from('submaps').upsert([
    { map_id: family.data.id, name: 'Mom', color: '#eb877b', sort_order: 0 },
    { map_id: family.data.id, name: 'Dad', color: '#858626', sort_order: 1 },
    { map_id: family.data.id, name: 'Sister', color: '#2ecc71', sort_order: 2 },
  ], { onConflict: 'map_id,name', ignoreDuplicates: true })
  if (children.error) throw new Error('setup-failed')
}

async function readWorkspace(client) {
  const userId = await readUser(client)
  const [parentResult, childResult, roleResult, pins] = await Promise.all([
    client.from('maps').select('*').order('sort_order', { ascending: true }),
    client.from('submaps').select('*').order('sort_order', { ascending: true }),
    client.from('map_collaborators').select('map_id, role').eq('user_id', userId),
    readPins(client),
  ])
  const parents = rows(parentResult), children = rows(childResult), roles = rows(roleResult)
  if (!parents.some(map => ownAllPlaces(map, userId))) throw new Error('setup-incomplete')
  const maps = parents.map(map => ({
    id: map.id, name: map.name, color: map.color, sortOrder: map.sort_order,
    visible: false, isDefault: ownAllPlaces(map, userId),
    role: map.user_id === userId ? 'owner' : roles.find(item => item.map_id === map.id)?.role || 'viewer',
    submaps: children.filter(child => child.map_id === map.id).map(child => ({
      id: child.id, name: child.name, color: child.color, sortOrder: child.sort_order, visible: false,
    })),
  }))
  return { userId, maps, pins }
}

export function createWorkspaceLoader(client) {
  let state = { status: 'loading', data: null, error: '' }
  let listener, running, setupAttempted = false
  const publish = next => { state = next; listener?.(state) }
  return {
    reportFailure() {
      publish({ ...state, status: 'error', error: 'Could not refresh your maps and pins. Previously loaded data may be out of date. Retry to load saved data.' })
    },
    subscribe(callback) {
      listener = callback
      callback(state)
      return () => { if (listener === callback) listener = null }
    },
    run(initialize = false) {
      if (running) return running
      publish({ ...state, status: 'loading', error: '' })
      // Defer work so `running` is set even if a client throws synchronously.
      running = Promise.resolve().then(async () => {
        try {
          if (initialize && !setupAttempted) {
            setupAttempted = true
            await initializeDefaultMaps(client)
          }
          const data = await readWorkspace(client)
          publish({ status: 'ready', data, error: '' })
          return true
        } catch (error) {
          const message = error?.message === 'setup-incomplete'
            ? 'Could not verify your initial map setup. Retry checks saved data only. If setup remains incomplete, reload the page.'
            : error?.message === 'setup-failed'
              ? 'Could not finish setting up your maps. Retry checks saved data without repeating setup.'
              : state.data
                ? 'Could not refresh your maps and pins. Previously loaded data may be out of date. Retry to load saved data.'
                : 'Could not load your maps and pins. Check your connection and try again.'
          publish({ ...state, status: 'error', error: message })
          return false
        } finally { running = null }
      })
      return running
    },
  }
}
