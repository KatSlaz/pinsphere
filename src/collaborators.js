export async function loadCollaborators(client, mapId) {
  const { data, error } = await client.rpc('get_map_collaborators', { p_map_id: mapId })
  if (error) throw error
  return [...(data || [])].sort((a, b) =>
    Number(b.role === 'owner') - Number(a.role === 'owner'))
}

export async function writeCollaborator(client, mapId, member, role) {
  if (member.role === 'owner') throw new Error('The owner cannot be changed or removed.')
  if (role !== null && !['viewer', 'editor'].includes(role)) throw new Error('Invalid collaborator role.')
  const table = client.from('map_collaborators')
  const query = role === null ? table.delete() : table.update({ role })
  const { data, error } = await query.eq('map_id', mapId).eq('user_id', member.user_id)
    .select('map_id,user_id,role')
  if (error) throw error
  if (data?.length !== 1 || data[0].map_id !== mapId || data[0].user_id !== member.user_id
      || (role !== null && data[0].role !== role)) {
    throw new Error('The change could not be confirmed. Refresh the list; your permissions or this membership may have changed.')
  }
}

// Duplicate protection is synchronous; refetches cannot replace newer writes.
export function createCollaboratorManager({ client, mapId, onStatus, onWrite, onMembers }) {
  const pending = new Set()
  let version = 0
  let disposed = false
  return {
    async run(member, role) {
      if (disposed || pending.has(member.user_id)) return
      pending.add(member.user_id)
      version++
      onStatus(member, { busy: true, message: '' })
      try {
        await writeCollaborator(client, mapId, member, role)
      } catch (error) {
        pending.delete(member.user_id)
        if (!disposed) onStatus(member, { busy: false, error: true,
          message: error.message || 'Could not confirm the change. Please try again.' })
        return
      }
      if (disposed) return
      onWrite(member, role)
      const request = ++version
      try {
        const members = await loadCollaborators(client, mapId)
        if (!disposed && request === version) onMembers(members)
        if (!disposed) onStatus(member, { busy: false,
          message: role === null ? 'Collaborator removed.' : 'Role saved.' })
      } catch {
        if (!disposed) onStatus(member, { busy: false, refreshFailed: true,
          message: `${role === null ? 'Removal succeeded' : 'Role change succeeded'}, but the list could not be refreshed. Refresh the list before making further changes.` })
      } finally {
        pending.delete(member.user_id)
      }
    },
    dispose() { disposed = true; version++ },
  }
}
