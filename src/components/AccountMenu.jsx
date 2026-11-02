import { useId, useLayoutEffect, useRef, useState, useEffect } from 'react'
import { menuFocusIndex } from '../menuPosition'

export default function AccountMenu({ email, triggerRef, invitationCount = 0, onInvitations, onSettings, onLogout, logoutBusy, logoutError }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const container = useRef(null)
  const menu = useRef(null)
  const initialFocus = useRef('first')
  const close = (restore = false) => {
    setOpen(false)
    if (restore) triggerRef.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open) return
    const items = menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')
    const item = initialFocus.current === 'last' ? items[items.length - 1] : items[0]
    item?.focus()
  }, [open, logoutBusy])
  useEffect(() => {
    if (!open) return
    const outside = event => {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
  return <div ref={container} className="navbar-account" onBlur={event => {
    // Disabling the pending logout action can blur it before focus moves to
    // another enabled item. Keep the menu and its eventual error available.
    if (!event.target.matches(':disabled') && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <button type="button" ref={triggerRef} className="navbar-account-button"
      aria-label={email ? `Account menu for ${email}` : 'Account menu'} title={email || 'Account'}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { initialFocus.current = 'first'; setOpen(value => !value) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
          setOpen(true)
        }
      }}>
      <span className="navbar-account-email">{email || 'Account'}</span><span className="navbar-account-chevron" aria-hidden="true">▼</span>
    </button>
    {open && <div ref={menu} id={menuId} className="account-dropdown" role="menu" aria-label="Account"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
        if (event.key === 'Tab') { close(true); return }
        const items = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')]
        const next = menuFocusIndex(event.key, items.indexOf(document.activeElement), items.length)
        if (next >= 0) { event.preventDefault(); event.stopPropagation(); items[next].focus() }
      }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { close(true); onInvitations() }}>
        Invitations{invitationCount > 0 && ` (${invitationCount})`}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { close(); onSettings() }}>Settings</button>
      <button type="button" role="menuitem" tabIndex={-1} disabled={logoutBusy} onClick={onLogout}>{logoutBusy ? 'Logging out…' : 'Log Out'}</button>
      {logoutError && <p className="account-error" role="alert">{logoutError}</p>}
    </div>}
  </div>
}
