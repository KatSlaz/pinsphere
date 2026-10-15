export function menuPosition(anchor, menu, viewport, gap = 4, edge = 8) {
  const width = Math.min(menu.width, Math.max(0, viewport.width - edge * 2))
  const height = Math.min(menu.height, Math.max(0, viewport.height - edge * 2))
  const below = anchor.bottom + gap
  const above = anchor.top - gap - height
  return {
    left: Math.max(edge, Math.min(anchor.right - width, viewport.width - edge - width)),
    top: Math.max(edge, Math.min(below + height <= viewport.height - edge ? below : above, viewport.height - edge - height)),
  }
}

export function menuFocusIndex(key, current, count) {
  if (!count) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return -1
}
