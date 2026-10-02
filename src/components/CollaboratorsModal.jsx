import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { createCollaboratorManager, loadCollaborators } from '../collaborators'
import './CollaboratorsModal.css'

const labels = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }

export default function CollaboratorsModal({ map, currentUserId, onClose, returnFocusRef }) {
  const dialogRef = useRef(null)
  const headingId = useId()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ status: 'loading', members: [] })
  const [memberStates, setMemberStates] = useState({})
  const managerRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus = returnFocusRef.current
    dialog.showModal()
    return () => {
      dialog.close()
      returnFocus?.focus()
    }
  }, [returnFocusRef])

  useEffect(() => {
    let cancelled = false
    const manager = createCollaboratorManager({
      client: supabase, mapId: map.id,
      onStatus: (member, state) => setMemberStates(previous => ({ ...previous, [member.user_id]: state })),
      onWrite: (member, role) => {
        setResult(previous => ({ ...previous, members: role === null
          ? previous.members.filter(item => item.user_id !== member.user_id)
          : previous.members.map(item => item.user_id === member.user_id ? { ...item, role } : item) }))
        if (role === null && dialogRef.current) {
          dialogRef.current.querySelector('button')?.focus()
        }
      },
      onMembers: members => setResult({ status: 'loaded', members }),
    })
    managerRef.current = manager
    loadCollaborators(supabase, map.id).then(members => {
      if (!cancelled) setResult({ status: 'loaded', members })
    }).catch(() => {
      if (!cancelled) setResult({ status: 'error', members: [] })
    })
    return () => { cancelled = true; manager.dispose() }
  }, [map.id, attempt])

  const collaborators = result.members.filter(member => member.role !== 'owner')
  const isOwner = Boolean(currentUserId && result.members.some(member => member.role === 'owner' && member.user_id === currentUserId))
  const anyBusy = Object.values(memberStates).some(state => state.busy)
  const needsRefresh = Object.values(memberStates).some(state => state.refreshFailed)
  const retry = () => {
    setMemberStates({})
    setResult(previous => ({ ...previous, status: 'loading' }))
    setAttempt(value => value + 1)
  }
  const manage = (member, role) => {
    if (!isOwner || member.role === 'owner' || member.user_id === currentUserId) return
    if (role === null && !window.confirm(`Remove ${member.email || 'this collaborator'} from this map? They will lose access to the map.`)) return
    void managerRef.current?.run(member, role)
  }
  return createPortal(
    <dialog ref={dialogRef} className="collaborators-dialog" aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="collaborators-header">
        <h3 id={headingId}>Collaborators — {map.name}</h3>
        <button type="button" onClick={onClose} aria-label="Close collaborators">Close</button>
      </div>
      <div aria-live="polite" aria-busy={result.status === 'loading'}>
        {result.status === 'loading' && <p>Loading collaborators…</p>}
        {result.status === 'error' && <>
          <p role="alert">Could not load collaborators. Please try again.</p>
          <button type="button" onClick={retry}>Retry</button>
        </>}
        {result.status === 'loaded' && <>
          {result.members.length > 0 && <ul className="collaborators-list">
            {result.members.map(member => <li key={member.user_id}>
              <div className="collaborator-row">
              <span className="collaborator-email">{member.email || 'Email unavailable'}</span>
              {isOwner && member.role !== 'owner' && member.user_id !== currentUserId
                ? <div className="collaborator-controls">
                  <select value={member.role} aria-label={`Role for ${member.email || 'collaborator'}`}
                    disabled={Boolean(memberStates[member.user_id]?.busy) || needsRefresh}
                    onChange={event => manage(member, event.target.value)}>
                    <option value="viewer">Viewer</option><option value="editor">Editor</option>
                  </select>
                  <button type="button" disabled={Boolean(memberStates[member.user_id]?.busy) || needsRefresh}
                    aria-label={`Remove ${member.email || 'collaborator'}`} onClick={() => manage(member, null)}>Remove</button>
                </div>
                : <span className="collaborator-role">{labels[member.role] || 'Unknown role'}</span>}
              </div>
              <div className="collaborator-feedback" aria-live="polite">
                {memberStates[member.user_id]?.busy && <span>Saving…</span>}
                {memberStates[member.user_id]?.message && <span role={memberStates[member.user_id].error || memberStates[member.user_id].refreshFailed ? 'alert' : undefined}>
                  {memberStates[member.user_id].message}
                </span>}
              </div>
            </li>)}
          </ul>}
          {result.members.length === 0
            ? <p>No members were returned. Close and reopen this view to refresh.</p>
            : collaborators.length === 0 && <p>No collaborators yet.</p>}
        </>}
        {Object.entries(memberStates).filter(([id]) => !result.members.some(member => member.user_id === id))
          .map(([id, state]) => <p key={id} role={state.refreshFailed ? 'alert' : 'status'}>{state.message}</p>)}
        {needsRefresh && <button type="button" disabled={anyBusy} onClick={retry}>Refresh collaborators</button>}
      </div>
    </dialog>, document.body,
  )
}
