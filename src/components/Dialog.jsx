import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { dialogStack, dialogReturnTarget } from '../dialogs'
import './Dialog.css'

let bodyOverflow = ''

export default function Dialog({ label, onClose, busy = false, error, onOpen, returnFocusRef, children, className = '', dismissOnBackdrop = false }) {
  const ref = useRef(null)
  const lastFocus = useRef(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open || !dialogStack.isTop(dialog)) return
    if (busy && !dialog.contains(document.activeElement)) dialog.focus()
    else if (!busy && document.activeElement === dialog && lastFocus.current?.isConnected) lastFocus.current.focus()
  }, [busy])
  useLayoutEffect(() => {
    const dialog = ref.current
    const previous = returnFocusRef?.current || document.activeElement
    if (!dialogStack.active) bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    const unregister = dialogStack.add(dialog)
    onOpen?.()
    return () => {
      unregister()
      dialog.close()
      if (!dialogStack.active) document.body.style.overflow = bodyOverflow
      // Wait for React to remove a nested confirmation and any deleted member
      // row before choosing a return target in the surviving parent dialog.
      queueMicrotask(() => {
        const top = dialogStack.top
        if (!top && !previous?.isConnected && document.activeElement !== document.body) return
        dialogReturnTarget(previous, top, document.querySelector('.maplibregl-canvas'))?.focus({ preventScroll: true })
      })
    }
  }, [onOpen, returnFocusRef])
  return createPortal(<dialog ref={ref} tabIndex={-1} className={`app-dialog ${className}`} aria-label={label} aria-busy={busy}
    onFocusCapture={event => { if (event.target !== ref.current) lastFocus.current = event.target }}
    onCancel={event => {
      event.preventDefault()
      event.stopPropagation()
      if (!busy && dialogStack.isTop(ref.current)) onClose?.()
    }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab' || !dialogStack.isTop(ref.current)) return
      const dialog = ref.current
      const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus()
      }
    }}
    onClick={event => {
      event.stopPropagation()
      const rect = ref.current.getBoundingClientRect()
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
      if (dismissOnBackdrop && event.target === ref.current && outside && !busy && dialogStack.isTop(ref.current)) onClose?.()
    }}>
    <fieldset className="dialog-body" disabled={busy}>{children}</fieldset>
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {busy && <p className="dialog-status" role="status">Saving…</p>}
  </dialog>, document.body)
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose, busy, error }) {
  return <Dialog label={title} onClose={onClose} busy={busy} error={error}>
    <div className="confirmation-content">
      <h3>{title}</h3><p>{message}</p>
      <div className="dialog-actions">
        <button type="button" autoFocus onClick={onClose}>Cancel</button>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </Dialog>
}
