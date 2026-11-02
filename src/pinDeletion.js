// UI eligibility only. The RPC independently authorizes every connection.
export function canRemovePinConnections(pin, maps) {
  return maps.some(map => ['owner', 'editor'].includes(map.role) && (
    pin.maps.includes(`map:${map.id}`) ||
    map.submaps.some(child => pin.maps.includes(`submap:${child.id}`))
  ))
}

// Refresh accessible destinations/roles too: a failed deletion may be caused by
// a role change. Keep the user's visibility choices while replacing access data.
export async function readDeletionMaps(client, userId, previous) {
  const [parents, children, roles] = await Promise.all([
    client.from('maps').select('*').order('sort_order', { ascending: true }),
    client.from('submaps').select('*').order('sort_order', { ascending: true }),
    client.from('map_collaborators').select('map_id, role').eq('user_id', userId),
  ])
  if ([parents, children, roles].some(result => result.error || !Array.isArray(result.data))) {
    throw new Error('Could not refresh map access.')
  }
  return parents.data.map(map => {
    const old = previous.find(item => item.id === map.id)
    return {
      id: map.id, name: map.name, color: map.color, sortOrder: map.sort_order,
      visible: old?.visible || false,
      isDefault: map.is_default === true && map.user_id === userId && map.name === 'All Places',
      role: map.user_id === userId ? 'owner' : roles.data.find(item => item.map_id === map.id)?.role || 'viewer',
      submaps: children.data.filter(child => child.map_id === map.id).map(child => ({
        id: child.id, name: child.name, color: child.color, sortOrder: child.sort_order,
        visible: old?.submaps.find(item => item.id === child.id)?.visible || false,
      })),
    }
  })
}

// A failed refresh keeps retries locked, including after closing/reopening.
// Refresh never repeats the write. Raw database errors are not shown to users.
export function createPinDeletion(client) {
  const pending = new Map()
  let busy = false
  const recover = async (id, refresh) => {
    const outcome = pending.get(id)
    let refreshed = false
    try { refreshed = await refresh() === true } catch { /* Keep the retry lock. */ }
    if (refreshed) pending.delete(id)
    return { outcome, refreshed }
  }
  return {
    needsRefresh: id => pending.has(id),
    async remove(id, editable, refresh) {
      if (busy || pending.has(id) || !editable) return null
      busy = true
      try {
        let outcome = 'uncertain'
        try {
          const { data, error } = await client.rpc('delete_pin_from_editable_maps', { p_pin_id: id })
          if (!error && data === true) outcome = 'saved'
          else if (!error && data === false) outcome = 'unavailable'
        } catch { /* The transaction may have committed. */ }
        pending.set(id, outcome)
        return await recover(id, refresh)
      } finally { busy = false }
    },
    async refresh(id, refresh) {
      if (busy || !pending.has(id)) return null
      busy = true
      try { return await recover(id, refresh) } finally { busy = false }
    },
  }
}

export function deletionFeedback({ outcome, refreshed }) {
  if (!refreshed) return outcome === 'saved'
    ? 'The removal succeeded, but the map could not be refreshed. Refresh the map before continuing.'
    : 'The result could not be verified. Refresh the map before trying again.'
  if (outcome === 'saved') return 'Pin connections updated.'
  if (outcome === 'unavailable') return 'No editable connections were removed. The map has been refreshed; your access or the pin may have changed.'
  return 'Deletion could not be confirmed. The map has been refreshed. Review it before trying again.'
}
