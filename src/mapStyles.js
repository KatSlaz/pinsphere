export const MAP_STYLE_STORAGE_KEY = 'pinsphere-map-style'
export const DEFAULT_MAP_STYLE = 'fiord'

export const MAP_STYLES = [
  { id: 'fiord', label: 'Default (Fiord)', url: 'https://tiles.openfreemap.org/styles/fiord' },
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'liberty', label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'positron', label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
]

export function normalizeMapStyle(value) {
  return MAP_STYLES.some(style => style.id === value) ? value : DEFAULT_MAP_STYLE
}
