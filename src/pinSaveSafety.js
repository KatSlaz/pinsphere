// A database rejection is different from an interrupted response: the latter
// may arrive after the server has committed the write. Never blindly retry it.
export function isRejectedPinWrite(error) {
  return /^(22|23|28|42|44)[A-Z0-9]{3}$/.test(error?.code || '')
}

export function confirmedPinRollback(pinId, { data, error }) {
  return !error && Array.isArray(data) && data.some(row => row.id === pinId)
}

const copyDraft = draft => ({ ...draft, maps: [...draft.maps], ...(draft.location ? { location: { ...draft.location } } : {}) })
const copyPin = pin => ({ ...pin, maps: [...pin.maps] })

// Read both parts through the caller's ordinary RLS-scoped client. A failed or
// missing response is never evidence that a pin has no memberships.
export async function readFreshPin(client, id) {
  const { data: pin, error } = await client.from('pins')
    .select('id,user_id,name,notes,longitude,latitude').eq('id', id).single()
  if (error || !pin || pin.id !== id) throw new Error('Could not verify the saved pin. Your draft is kept; reconnect and try again. If it remains unavailable, your access may have changed.')
  const connections = await client.from('pin_maps').select('map_id,submap_id').eq('pin_id', id)
  if (connections.error || !Array.isArray(connections.data) || connections.data.some(row => (row.map_id == null) === (row.submap_id == null))) {
    throw new Error('Could not verify the saved connections. Your draft is kept; reconnect and try Check saved pin again.')
  }
  return { id: pin.id, userId: pin.user_id, name: pin.name, notes: pin.notes || '', longitude: pin.longitude, latitude: pin.latitude,
    maps: [...new Set(connections.data.map(row => row.map_id != null ? `map:${row.map_id}` : `submap:${row.submap_id}`))] }
}

export function createPinRecovery() {
  const entries = new Map()
  let creation = null
  return {
    lock(pin, draft) { entries.set(pin.id, { pin: copyPin(entries.get(pin.id)?.pin || pin), draft: copyDraft(draft) }) },
    get(id) { const entry = entries.get(id); return entry ? { pin: copyPin(entry.pin), draft: copyDraft(entry.draft) } : null },
    keepDraft(id, draft) { const entry = entries.get(id); if (entry) entry.draft = copyDraft(draft) },
    lockCreation(draft) { creation = copyDraft(draft) },
    getCreation() { return creation ? copyDraft(creation) : null },
    async recover(client, id) {
      const entry = entries.get(id)
      if (!entry) throw new Error('No pending recovery for this pin.')
      const pin = await readFreshPin(client, id)
      if (entries.get(id) !== entry) throw new Error('The pin changed during recovery. Please check again.')
      // Reapply only the user's membership delta. Keep concurrent connections
      // that were not in the original draft baseline, and avoid duplicate inserts.
      const added = entry.draft.maps.filter(key => !entry.pin.maps.includes(key))
      const removed = new Set(entry.pin.maps.filter(key => !entry.draft.maps.includes(key)))
      const draft = { ...copyDraft(entry.draft), name: entry.draft.name === entry.pin.name ? pin.name : entry.draft.name,
        notes: entry.draft.notes === entry.pin.notes ? pin.notes : entry.draft.notes, maps: [...new Set([...pin.maps.filter(key => !removed.has(key)), ...added])] }
      entries.delete(id)
      return { pin, draft }
    },
  }
}
