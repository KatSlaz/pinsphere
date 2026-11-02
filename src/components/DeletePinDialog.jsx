import Dialog from './Dialog'

export default function DeletePinDialog({ busy, needsRefresh, editable = true, message, onClose, onDelete, onRefresh, returnFocusRef }) {
  return <Dialog label="Delete Pin?" onClose={onClose} busy={busy} busyLabel="Updating map…" returnFocusRef={returnFocusRef}>
    <div className="pin-details-popup">
      <h3>Delete Pin?</h3>
      <p>Remove this pin from all maps and submaps you can edit?</p>
      {message && <p role="status">{message}</p>}
      <div className="pin-details-buttons">
        <button type="button" autoFocus onClick={onClose}>Cancel</button>
        {needsRefresh && <button type="button" onClick={onRefresh}>Refresh map</button>}
        <button type="button" className="pin-delete-button" disabled={needsRefresh || !editable} onClick={onDelete}>Delete Pin</button>
      </div>
    </div>
  </Dialog>
}
