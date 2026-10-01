import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { loadCollaborators } from '../collaborators'
import './CollaboratorsModal.css'

const labels = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }

export default function CollaboratorsModal({ map, onClose, returnFocusRef }) {
  const dialogRef = useRef(null)
  const headingId = useId()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ status: 'loading', members: [] })

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
    loadCollaborators(supabase, map.id).then(members => {
      if (!cancelled) setResult({ status: 'loaded', members })
    }).catch(() => {
      if (!cancelled) setResult({ status: 'error', members: [] })
    })
    return () => { cancelled = true }
  }, [map.id, attempt])

  const collaborators = result.members.filter(member => member.role !== 'owner')
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
          <button type="button" onClick={() => {
            setResult({ status: 'loading', members: [] })
            setAttempt(value => value + 1)
          }}>Retry</button>
        </>}
        {result.status === 'loaded' && <>
          {result.members.length > 0 && <ul className="collaborators-list">
            {result.members.map(member => <li key={member.user_id}>
              <span className="collaborator-email">{member.email || 'Email unavailable'}</span>
              <span className="collaborator-role">{labels[member.role] || 'Unknown role'}</span>
            </li>)}
          </ul>}
          {result.members.length === 0
            ? <p>No members were returned. Close and reopen this view to refresh.</p>
            : collaborators.length === 0 && <p>No collaborators yet.</p>}
        </>}
      </div>
    </dialog>, document.body,
  )
}
