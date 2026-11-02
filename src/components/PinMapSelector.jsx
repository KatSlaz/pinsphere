import { useId } from 'react'
import { membershipState, mapSelectionId, submapSelectionId } from '../pinMemberships'

export default function PinMapSelector({ maps, selected, expanded, onExpand, onMap, onSubmap, editing, error }) {
  const id = useId()
  const editable = maps.filter(map => map.role === 'owner' || map.role === 'editor')
  const readonly = editing ? maps.filter(map => !editable.includes(map) && !map.isDefault && membershipState(map, selected).applicable) : []
  return <>
    <h4 id={`${id}-label`}>Maps</h4>
    {error && <p id="pin-maps-error" className="field-error" role="alert">{error}</p>}
    <div className="pin-map-list" role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? 'pin-maps-error' : undefined} tabIndex={-1}>
      {!editable.length && <p className="pin-form-hint">No editable maps are available.</p>}
      {editable.map(map => {
        const state = membershipState(map, selected)
        const partial = map.isDefault
          ? !selected.includes(mapSelectionId(map.id)) && editable.some(candidate => !candidate.isDefault && membershipState(candidate, selected).applicable)
          : state.partial
        return <div key={map.id}>
          <div className="pin-map-item">
            {map.submaps.length > 0 ? <button type="button" className="pin-dropdown-button" aria-expanded={expanded.includes(map.id)} aria-controls={`${id}-${map.id}`} aria-label={`${expanded.includes(map.id) ? 'Collapse' : 'Expand'} ${map.name}`} onClick={() => onExpand(map.id)}><span className="pin-chevron" /></button> : <span className="pin-expand-spacer" />}
            <label className="pin-membership-label" title={map.name}>
              <input type="checkbox" style={{ accentColor: map.color }} checked={selected.includes(mapSelectionId(map.id))} ref={input => { if (input) input.indeterminate = partial }} onChange={() => onMap(map.id)} aria-describedby={map.isDefault ? `${id}-all` : undefined} />
              <span className="pin-map-name">{map.name}</span>
              {state.children.length > 0 && <span className="pin-selection-count" aria-label={`${state.children.length} of ${map.submaps.length} submaps selected`}>{state.children.length}/{map.submaps.length}</span>}
            </label>
          </div>
          {map.isDefault && <p id={`${id}-all`} className="pin-form-hint">Selects or clears all editable maps and submaps.</p>}
          {map.submaps.length > 0 && <div id={`${id}-${map.id}`} className="pin-submap-list" hidden={!expanded.includes(map.id)}>
            {map.submaps.map(submap => <label key={submap.id} className="pin-submap-item pin-membership-label" title={submap.name}>
              <input type="checkbox" aria-label={`Include ${submap.name} in ${map.name}`} style={{ accentColor: submap.color }} checked={selected.includes(submapSelectionId(submap.id))} onChange={() => onSubmap(map.id, submap.id)} />
              <span className="pin-submap-name">{submap.name}</span>
            </label>)}
          </div>}
        </div>
      })}
      {readonly.length > 0 && <div className="pin-readonly"><p className="pin-form-hint">Read-only memberships · kept when saving</p>{readonly.map(map => {
        const state = membershipState(map, selected)
        return <div key={map.id}><span>{map.name}</span>{state.children.length > 0 && <span className="pin-readonly-children">{state.children.map(child => child.name).join(', ')}</span>}</div>
      })}</div>}
    </div>
  </>
}
