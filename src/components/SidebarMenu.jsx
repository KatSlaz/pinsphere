import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { menuFocusIndex, menuPosition } from '../menuPosition'

export default function SidebarMenu({ anchor, id, label, onClose, children }) {
  const ref = useRef(null)
  const [position, setPosition] = useState(null)
  const positioned = Boolean(position)
  useLayoutEffect(() => {
    if (positioned) ref.current.querySelector('button:not(:disabled)')?.focus()
  }, [positioned])
  useLayoutEffect(() => {
    const menu = ref.current
    const update = () => {
      if (!anchor?.isConnected) { onClose(false); return }
      const rect = anchor.getBoundingClientRect()
      // Close when the trigger scrolls out of its list, rather than floating detached.
      const list = anchor.closest('.map-list')?.getBoundingClientRect()
      if (list && (rect.bottom <= list.top || rect.top >= list.bottom)) { onClose(false); return }
      setPosition(menuPosition(rect, menu.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }))
    }
    const outside = event => {
      if (!menu.contains(event.target) && !anchor.contains(event.target)) onClose(false)
    }
    update()
    const resize = new ResizeObserver(update)
    resize.observe(anchor)
    const sidebar = anchor.closest('.map-sidebar')
    if (sidebar) resize.observe(sidebar)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [anchor, onClose])

  return createPortal(<div ref={ref} id={id} className="sidebar-menu" role="menu" aria-label={label}
    style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
    onPointerDown={event => event.stopPropagation()}
    onClickCapture={event => {
      // Restore focus before the action opens a dialog; don't unmount its handler.
      if (event.target.closest('button')) anchor?.focus()
    }}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); return }
      if (event.key === 'Tab') { onClose(true); return }
      const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')]
      const index = menuFocusIndex(event.key, buttons.indexOf(document.activeElement), buttons.length)
      if (index >= 0) { event.preventDefault(); event.stopPropagation(); buttons[index].focus() }
    }}>
    {children}
  </div>, document.body)
}
