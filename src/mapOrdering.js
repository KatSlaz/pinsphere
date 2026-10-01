export function sortItems(items, positions = {}) {
  return [...items].sort((a, b) => {
    const ap = positions[a.id]
    const bp = positions[b.id]
    if (ap !== undefined || bp !== undefined) {
      if (ap === undefined) return 1
      if (bp === undefined) return -1
      if (ap !== bp) return ap - bp
    }
    return (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.id - b.id
  })
}

export function applyPersonalOrder(maps, order) {
  const sorted = sortItems(maps, order.maps).map(map => ({
    ...map, submaps: sortItems(map.submaps, order.submaps),
  }))
  return [...sorted.filter(map => map.isDefault), ...sorted.filter(map => !map.isDefault)]
}

export function moveWithinList(ids, source, target) {
  const from = ids.indexOf(source)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, source)
  return next
}

export function pinColor(pin, maps) {
  const connections = new Set(pin.maps)
  for (const map of maps) {
    if (map.isDefault) continue
    const submap = map.submaps.find(submap => connections.has(`submap:${submap.id}`))
    if (submap && map.submaps.every(submap => connections.has(`submap:${submap.id}`))) {
      return map.color
    }
    if (submap) return submap.color
    if (connections.has(`map:${map.id}`)) return map.color
  }
  return '#3388ff'
}

export function positionsFor(ids) {
  return Object.fromEntries(ids.map((id, index) => [id, index]))
}

export function orderBatch(userId, parentId, ids, maps) {
  const available = parentId === null
    ? maps.filter(map => !map.isDefault)
    : maps.find(map => map.id === parentId)?.submaps || []
  const allowed = new Set(available.map(item => item.id))
  const column = parentId === null ? 'map_id' : 'submap_id'
  return {
    table: parentId === null ? 'user_map_order' : 'user_submap_order',
    onConflict: `user_id,${column}`,
    rows: [...new Set(ids)].filter(id => allowed.has(id))
      .map((id, index) => ({ user_id: userId, [column]: id, sort_order: index })),
  }
}

// Serialize batches per list. Newer edits replace queued edits for that list.
export function createOrderQueue(save, onStatus) {
  const pending = new Map()
  let running = false
  let disposed = false
  async function flush() {
    if (running || disposed) return
    running = true
    onStatus('saving')
    try {
      while (pending.size && !disposed) {
        const [key, value] = pending.entries().next().value
        try {
          await save(value)
        } catch {
          if (!disposed) onStatus('error')
          return
        }
        if (pending.get(key) === value) pending.delete(key)
      }
      if (!disposed) onStatus('saved')
    } finally {
      running = false
    }
  }
  return {
    enqueue(key, value) { pending.set(key, value); return flush() },
    retry: flush,
    dispose() { disposed = true },
  }
}
