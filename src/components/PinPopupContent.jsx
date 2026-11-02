import { membershipState } from '../pinMemberships'

export default function PinPopupContent({ pin, maps, editable, userId, onClose, onEdit, onDelete }) {
  const memberships = maps.filter(map => !map.isDefault)
    .map(map => ({ map, ...membershipState(map, pin.maps) })).filter(state => state.applicable)
  return <div className="pin-popup" role="region" aria-label={pin.name}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <strong>{pin.name}</strong>
    {pin.notes && <div className="pin-popup-notes"><span>Notes</span><p>{pin.notes}</p></div>}
    {memberships.length > 0 && <div className="pin-popup-maps">
      <span>Maps</span>
      {memberships.map(({ map, children }) => <div key={map.id} className="pin-popup-map">
        <div className="pin-popup-map-name">{map.name}</div>
        {children.length > 0 && <div className="pin-popup-submaps">
          {children.map(child => <div key={child.id} className="pin-popup-submap-name">{child.name}</div>)}
        </div>}
      </div>)}
    </div>}
    {(editable || pin.maps.length === 0 && pin.userId === userId) && <div className="pin-popup-buttons">
      {editable && <button type="button" className="pin-edit-button" onClick={onEdit}>Edit Pin</button>}
      <button type="button" className="pin-delete-button" onClick={onDelete}>Delete Pin Everywhere</button>
    </div>}
  </div>
}
