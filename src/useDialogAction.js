import { useCallback, useEffect, useRef, useState } from 'react'

export function useDialogAction({ onError } = {}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const clear = useCallback(() => setError(''), [])
  const run = action => async (...args) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try { return await action(...args) }
    catch (failure) {
      if (mounted.current) setError(onError?.(failure) || 'Could not complete this action. Please try again. Your entries have been kept.')
    }
    finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { error, setError, busy, clear, run }
}
