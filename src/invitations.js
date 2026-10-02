export function invitationStatus(invitation, now = Date.now()) {
  if (invitation.status !== 'pending') return invitation.status
  const deadline = Date.parse(invitation.expires_at)
  return Number.isFinite(deadline) && deadline > now ? 'pending' : 'expired'
}

export async function readInvitations(client, userId) {
  const [received, sent] = await Promise.allSettled([
    client.rpc('get_received_map_invitations'),
    client.from('map_invitations')
      .select('id,map_id,invitee_email,role,status,created_at,expires_at,maps(name)')
      .eq('inviter_id', userId).order('created_at', { ascending: false }),
  ])
  return [received, sent].map(result => result.status === 'fulfilled'
    ? result.value : { error: result.reason })
}

export async function removeSentInvitation(client, userId, invitationId) {
  const { data, error } = await client.from('map_invitations').delete()
    .eq('id', invitationId).eq('inviter_id', userId).select('id')
  if (error) throw error
  if (data?.length !== 1 || data[0].id !== invitationId) {
    throw new Error('Removal could not be confirmed. Refresh and try again; you must still own the map.')
  }
}
