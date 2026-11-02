import PinMapSelector from './PinMapSelector'

export default function PinFormFields({ editing, unconfirmed, errors, name, notes, onName, onNotes, maps, selected, expanded, onExpand, onMap, onSubmap }) {
 return <>
    {!editing && unconfirmed && <p className="field-error" role="alert">A previous pin creation could not be confirmed. Refresh the map and check All Places before adding another pin.</p>}
    {editing && (
        <p className="pin-form-hint pin-shared-notice">Changes to this pin's details apply everywhere it appears.</p>
    )}

    <label className="pin-field-label" htmlFor="pin-name">Place name</label>
    <input
        id="pin-name" type="text" autoFocus
        aria-label="Place name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'pin-name-error' : undefined}
        placeholder="Enter place name"
        value={name}
        onChange={(event) => onName(event.target.value)}
    />
    {errors.name && <p id="pin-name-error" className="field-error" role="alert">{errors.name}</p>}
    <label className="pin-field-label" htmlFor="pin-notes">Notes <span className="pin-form-hint">(optional)</span></label>
    <textarea
        id="pin-notes" aria-label="Notes"
        placeholder="Add notes about this place..."
        value={notes}
        onChange={(event) => onNotes(event.target.value)}
        rows={3}
    />

    <PinMapSelector maps={maps} selected={selected} expanded={expanded}
        onExpand={onExpand} onMap={onMap} onSubmap={onSubmap}
        editing={Boolean(editing)} error={errors.maps} />

 </>
}
