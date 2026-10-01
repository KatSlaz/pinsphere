import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { MAP_STYLE_STORAGE_KEY, normalizeMapStyle } from './mapStyles'
import { cachePreferences, createPreferenceSync, normalizeTheme, readLocalPreferences, THEME_STORAGE_KEY } from './preferences'

// Access storage inside the guarded helpers, including browsers that block its getter.
const browserStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}

export function usePreferences(userId) {
  const [preferences, setPreferences] = useState(() => readLocalPreferences(browserStorage))
  const currentPreferences = useRef(preferences)
  const [syncStatus, setSyncStatus] = useState('local')
  const sync = useRef(null)

  useEffect(() => {
    const applyAccountPreferences = value => {
      currentPreferences.current = value
      cachePreferences(browserStorage, value)
      setPreferences(value)
    }
    const controller = userId ? createPreferenceSync({
      client: supabase,
      userId,
      readLocal: () => readLocalPreferences(browserStorage),
      onPreferences: applyAccountPreferences,
      onStatus: setSyncStatus,
    }) : null
    sync.current = controller
    // Keep network work outside the Auth callback and allow cached UI immediately.
    Promise.resolve().then(() => controller?.start())

    const handleStorage = event => {
      if ([THEME_STORAGE_KEY, MAP_STYLE_STORAGE_KEY, null].includes(event.key)) {
        const value = { ...readLocalPreferences(browserStorage), ...controller?.getPending() }
        currentPreferences.current = value
        setPreferences(value)
      }
    }
    const retry = () => controller?.retry()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    return () => {
      controller?.dispose()
      sync.current = null
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
    }
  }, [userId])

  function change(patch) {
    const next = { ...currentPreferences.current, ...patch }
    currentPreferences.current = next
    setPreferences(next)
    cachePreferences(browserStorage, next)
    sync.current?.change(patch)
  }

  return {
    theme: preferences.theme,
    mapStyle: preferences.map_style,
    changeTheme: value => change({ theme: normalizeTheme(value) }),
    changeMapStyle: value => change({ map_style: normalizeMapStyle(value) }),
    syncStatus: userId ? syncStatus : 'local',
    retrySync: () => sync.current?.retry(),
  }
}
