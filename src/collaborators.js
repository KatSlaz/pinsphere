export async function loadCollaborators(client, mapId) {
  const { data, error } = await client.rpc('get_map_collaborators', { p_map_id: mapId })
  if (error) throw error
  return [...(data || [])].sort((a, b) =>
    Number(b.role === 'owner') - Number(a.role === 'owner'))
}
