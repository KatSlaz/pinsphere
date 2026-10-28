export const COLOR_PRESETS = ['#3388ff', '#7c3aed', '#db2777', '#e74c3c', '#f97316', '#eab308', '#22a06b', '#0891b2', '#64748b', '#333333']
export function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[\da-f]{3}$/i.test(hex)) return '#' + [...hex].map(c => c + c).join('').toLowerCase()
  return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : null
}

const clampPercent = value => Math.max(0, Math.min(100, value))

export function hexToHsv(value, fallbackHue = 0) {
  const hex = normalizeHex(value)
  if (!hex) return null
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  let h = fallbackHue
  if (delta) {
    const sector = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
    h = (sector * 60 + 360) % 360
  }
  return { h, s: max ? delta / max * 100 : 0, v: max * 100 }
}

export function hsvToHex({ h, s, v }) {
  if (![h, s, v].every(Number.isFinite)) return null
  const hue = ((h % 360) + 360) % 360 / 60
  const brightness = clampPercent(v) / 100
  const chroma = brightness * clampPercent(s) / 100
  const x = chroma * (1 - Math.abs(hue % 2 - 1)), m = brightness - chroma
  const channels = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(hue)]
  return '#' + channels.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')
}

export function hsvFromPoint(hsv, rect, x, y) {
  if (rect.width <= 0 || rect.height <= 0 || ![x, y].every(Number.isFinite)) return null
  return { ...hsv, s: clampPercent((x - rect.left) / rect.width * 100), v: clampPercent((1 - (y - rect.top) / rect.height) * 100) }
}

export function adjustHsv(hsv, key, shift = false) {
  const step = shift ? 10 : 1
  switch (key) {
    case 'ArrowLeft': return { ...hsv, s: clampPercent(hsv.s - step) }
    case 'ArrowRight': return { ...hsv, s: clampPercent(hsv.s + step) }
    case 'ArrowUp': return { ...hsv, v: clampPercent(hsv.v + step) }
    case 'ArrowDown': return { ...hsv, v: clampPercent(hsv.v - step) }
    case 'Home': return { ...hsv, s: 0 }
    case 'End': return { ...hsv, s: 100 }
    case 'PageUp': return { ...hsv, v: 100 }
    case 'PageDown': return { ...hsv, v: 0 }
    default: return null
  }
}
