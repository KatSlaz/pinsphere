import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { invitationStatus, readInvitations, removeSentInvitation } from './invitations'

export default function useInvitations(userId, open) {
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState('')
  const [now, setNow] = useState(Date.now)
  const generation = useRef({ value: 0 })
  const mounted = useRef(false)
  const actionRunning = useRef(false)

  useEffect(() => {
    const requests = generation.current
    mounted.current = true
    return () => { mounted.current = false; requests.value++ }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId || actionRunning.current) return
    const request = ++generation.current.value
    if (!mounted.current || request !== generation.current.value) return
    setLoading(true)
    const [receivedResult, sentResult] = await readInvitations(supabase, userId)
    if (!mounted.current || request !== generation.current.value) return
    if (!receivedResult.error) setReceived(receivedResult.data || [])
    if (!sentResult.error) setSent(sentResult.data || [])
    setErrors({
      received: receivedResult.error ? 'Could not refresh received invitations.' : '',
      sent: sentResult.error ? 'Could not refresh sent invitations.' : '',
    })
    setLoading(false)
    setNow(Date.now())
  }, [userId])

  useEffect(() => {
    const requests = generation.current
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true; requests.value++ }
  }, [refresh, open])

  useEffect(() => {
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    // Local clock only; this does not poll Supabase.
    const timer = open ? window.setInterval(() => setNow(Date.now()), 1000) : null
    return () => {
      window.removeEventListener('focus', onFocus)
      if (timer !== null) window.clearInterval(timer)
    }
  }, [refresh, open])

  const act = async (kind, invitation) => {
    if (actionRunning.current || !userId) return
    const pending = invitationStatus(invitation) === 'pending'
    if (kind === 'remove' && pending && !window.confirm(
      `Cancel the invitation to ${invitation.invitee_email}? They will no longer be able to accept it unless acceptance has already completed.`
    )) return
    actionRunning.current = true
    generation.current.value++
    setBusy({ kind, id: invitation.id })
    setActionError('')
    try {
      if (kind === 'remove') {
        await removeSentInvitation(supabase, userId, invitation.id)
        if (mounted.current) setSent(items => items.filter(item => item.id !== invitation.id))
      } else {
        const { data, error } = await supabase.rpc(
          kind === 'accept' ? 'accept_map_invitation' : 'decline_map_invitation',
          { invitation_id: invitation.id },
        )
        if (error) throw error
        if (data !== true) throw new Error('The invitation action could not be confirmed.')
        if (mounted.current) {
          setReceived(items => items.filter(item => item.id !== invitation.id))
          if (kind === 'accept') window.dispatchEvent(new Event('mapsUpdated'))
        }
      }
    } catch (error) {
      if (mounted.current) setActionError(error.message || 'Could not update this invitation. Please try again.')
    } finally {
      actionRunning.current = false
      if (mounted.current) {
        generation.current.value++
        setBusy(null)
        // Also clears stale cards after cancellation, expiration, or a remote action.
        await refresh()
      }
    }
  }

  return {
    received: received.filter(item => invitationStatus(item, now) === 'pending'),
    sent, errors, loading, busy, actionError, now, refresh, act,
  }
}
