import { MAP_STYLE_STORAGE_KEY, normalizeMapStyle } from './mapStyles.js'

export const THEME_STORAGE_KEY = 'pinsphere-theme'
export const PROFILE_FIELDS = 'id,theme,map_style'
export const normalizeTheme = value => ['light', 'dark', 'system'].includes(value) ? value : 'system'

export function readLocalPreferences(storage) {
  try {
    return {
      theme: normalizeTheme(storage.getItem(THEME_STORAGE_KEY)),
      map_style: normalizeMapStyle(storage.getItem(MAP_STYLE_STORAGE_KEY)),
    }
  } catch {
    return { theme: 'system', map_style: 'fiord' }
  }
}

export function cachePreferences(storage, preferences) {
  try {
    storage.setItem(THEME_STORAGE_KEY, preferences.theme)
    storage.setItem(MAP_STYLE_STORAGE_KEY, preferences.map_style)
  } catch {
    // Appearance still works when browser storage is unavailable.
  }
}

// One queue per signed-in account; only explicit edits are written to Supabase.
export function createPreferenceSync({ client, userId, readLocal, onPreferences, onStatus }) {
  let disposed = false
  let running = false
  let ready = false
  let pending = {}
  let inFlight = {}

  const readProfile = () => client.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle()

  async function run() {
    if (disposed || running) return
    running = true
    onStatus('syncing')
    try {
      if (!ready) {
        let result = await readProfile()
        if (disposed) return
        if (result.error) throw result.error
        if (!result.data) {
          const inserted = await client.from('profiles').insert({ id: userId, ...readLocal() })
          if (disposed) return
          // A duplicate means another tab/device initialized this account first.
          if (inserted.error && inserted.error.code !== '23505') throw inserted.error
          result = await readProfile()
          if (result.error) throw result.error
          if (!result.data) throw new Error('Profile was not available after initialization')
        }
        if (disposed) return
        ready = true
        onPreferences({
          theme: normalizeTheme(result.data.theme),
          map_style: normalizeMapStyle(result.data.map_style),
          ...pending,
        })
      }

      while (!disposed && Object.keys(pending).length) {
        const patch = pending
        inFlight = patch
        pending = {}
        let result
        try {
          result = await client.from('profiles').update(patch).eq('id', userId).select(PROFILE_FIELDS).single()
        } catch (error) {
          pending = { ...patch, ...pending }
          throw error
        }
        if (disposed) return
        if (result.error) {
          pending = { ...patch, ...pending }
          throw result.error
        }
        // Never apply an old write response over a newer local edit.
      }
      if (!disposed) onStatus('saved')
    } catch {
      if (!disposed) onStatus('error')
    } finally {
      inFlight = {}
      running = false
    }
  }

  return {
    start: run,
    change(patch) {
      pending = { ...pending, ...patch }
      return run()
    },
    retry() {
      // Re-read remote preferences when there are no unsaved local edits.
      if (!running && !Object.keys(pending).length) ready = false
      return run()
    },
    dispose() { disposed = true },
    getPending() { return { ...inFlight, ...pending } },
  }
}
