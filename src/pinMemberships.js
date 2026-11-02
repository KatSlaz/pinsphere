export const mapSelectionId = id => `map:${id}`
export const submapSelectionId = id => `submap:${id}`
export function membershipState(map, selections) {
  const children = map.submaps.filter(child => selections.includes(submapSelectionId(child.id)))
  const direct = selections.includes(mapSelectionId(map.id))
  return { children, direct, applicable: direct || children.length > 0,
    partial: children.length > 0 && children.length < map.submaps.length }
}
