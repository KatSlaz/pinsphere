export const COLOR_PRESETS = ['#3388ff', '#7c3aed', '#db2777', '#e74c3c', '#f97316', '#eab308', '#22a06b', '#0891b2', '#64748b', '#333333']
export function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[\da-f]{3}$/i.test(hex)) return '#' + [...hex].map(c => c + c).join('').toLowerCase()
  return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null
}
