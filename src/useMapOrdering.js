import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { createOrderQueue, orderBatch, positionsFor } from './mapOrdering.js'

const emptyOrder = () => ({ maps: {}, submaps: {} })

export function useMapOrdering(userId, accessibleMaps) {
  const [order, setOrder] = useState(emptyOrder)
  const [status, setStatus] = useState('loading')
  const [loadFailed, setLoadFailed] = useState(false)
  const orderRef = useRef(emptyOrder())
  const mapsRef = useRef(accessibleMaps)
  const syncRef = useRef(null)
  useEffect(() => { mapsRef.current = accessibleMaps }, [accessibleMaps])

  useEffect(() => {
    if (!userId) return
    let disposed = false
    const edited = new Set()
    const cacheKey = `pinsphere-sidebar-order:${userId}`
    function apply(value) {
      if (disposed) return
      orderRef.current = value
      setOrder(value)
      try { localStorage.setItem(cacheKey, JSON.stringify(value)) } catch { /* Optional cache. */ }
    }
    const queue = createOrderQueue(async ({ parentId, ids }) => {
      const batch = orderBatch(userId, parentId, ids, mapsRef.current)
      if (!batch.rows.length) return
      const { error } = await supabase.from(batch.table).upsert(batch.rows, { onConflict: batch.onConflict })
      if (error) throw error
    }, value => { if (!disposed) setStatus(value) })

    async function load() {
      try {
        const [parents, children] = await Promise.all([
          supabase.from('user_map_order').select('map_id,sort_order').eq('user_id', userId),
          supabase.from('user_submap_order').select('submap_id,sort_order').eq('user_id', userId),
        ])
        if (disposed) return
        if (parents.error || children.error) throw parents.error || children.error
        const loaded = {
          maps: Object.fromEntries(parents.data.map(row => [row.map_id, row.sort_order])),
          submaps: Object.fromEntries(children.data.map(row => [row.submap_id, row.sort_order])),
        }
        if (edited.has('maps')) loaded.maps = orderRef.current.maps
        for (const parentId of edited) {
          if (parentId === 'maps') continue
          for (const submap of mapsRef.current.find(map => map.id === parentId)?.submaps || []) {
            if (orderRef.current.submaps[submap.id] !== undefined) {
              loaded.submaps[submap.id] = orderRef.current.submaps[submap.id]
            }
          }
        }
        apply(loaded)
        setLoadFailed(false)
        if (!edited.size) setStatus('saved')
      } catch {
        if (!disposed) setLoadFailed(true)
      }
    }
    syncRef.current = {
      reorder(parentId, ids) {
        const field = parentId === null ? 'maps' : 'submaps'
        edited.add(parentId === null ? 'maps' : parentId)
        apply({ ...orderRef.current, [field]: { ...orderRef.current[field], ...positionsFor(ids) } })
        queue.enqueue(parentId ?? 'maps', { parentId, ids })
      },
      retry() { load(); queue.retry() },
    }
    Promise.resolve().then(() => {
      if (disposed) return
      let cached = emptyOrder()
      try {
        const saved = JSON.parse(localStorage.getItem(cacheKey))
        if (saved?.maps && saved?.submaps) cached = saved
      } catch { /* Fall back to shared ordering. */ }
      apply(cached)
      load()
    })
    return () => { disposed = true; queue.dispose(); syncRef.current = null }
  }, [userId])

  return { order, status: status === 'error' ? status : loadFailed ? 'load-error' : status, reorder: (parentId, ids) => syncRef.current?.reorder(parentId, ids), retry: () => syncRef.current?.retry() }
}
