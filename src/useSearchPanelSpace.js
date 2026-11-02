import { useLayoutEffect, useState } from 'react'

// Coordinates are in layout-viewport space, including a visual viewport's offset.
export function searchPanelSpace({ formBottom, viewportTop = 0, viewportHeight, controlsBottom = Infinity, manualTop = Infinity }) {
  const bottom = Math.min(viewportTop + viewportHeight - 16, controlsBottom, manualTop - 8)
  return Math.floor(Math.max(0, Math.min(480, viewportHeight * 0.6, bottom - formBottom - 4)))
}

export function useSearchPanelSpace(root, open) {
  const [layout, setLayout] = useState({ height: 480, compact: false })
  useLayoutEffect(() => {
    const form = root.current.querySelector('form')
    const viewport = window.visualViewport
    const update = () => {
      const height = viewport?.height || window.innerHeight
      const workspace = root.current.closest('.map-workspace-controls')
      const manual = workspace?.querySelector(':scope > .add-pin-button')
      const next = { compact: height <= 450, height: searchPanelSpace({
        formBottom: form.getBoundingClientRect().bottom,
        viewportTop: viewport?.offsetTop || 0, viewportHeight: height,
        controlsBottom: workspace?.getBoundingClientRect().bottom,
        manualTop: manual?.getClientRects().length ? manual.getBoundingClientRect().top : Infinity,
      }) }
      setLayout(previous => previous.height === next.height && previous.compact === next.compact ? previous : next)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(form)
    window.addEventListener('resize', update)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
    }
  }, [root, open, layout.compact])
  return layout
}
