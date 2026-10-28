// Tracks top-layer dialogs for application-level keyboard shortcuts.
export function createDialogStack() {
  const dialogs = []
  return {
    add(dialog) { dialogs.push(dialog); return () => { const index = dialogs.indexOf(dialog); if (index >= 0) dialogs.splice(index, 1) } },
    isTop(dialog) { return dialogs.at(-1) === dialog },
    get top() { return dialogs.at(-1) },
    get active() { return dialogs.length > 0 },
  }
}
export const dialogStack = createDialogStack()

export function dialogReturnTarget(previous, top, fallback) {
  if (previous?.isConnected && !previous.closest('[inert]') && !previous.matches(':disabled')
    && (!top || top.contains(previous))) return previous
  return top?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || top || fallback
}
