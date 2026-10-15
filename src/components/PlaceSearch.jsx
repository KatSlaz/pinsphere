import { useEffect, useId, useRef, useState } from 'react'
import { createPlaceSearch, normalizeQuery } from '../placeSearch'
import './PlaceSearch.css'

export default function PlaceSearch({ getContext, onSelect, onManual, sidebarOpen }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle', results: [] })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const composing = useRef(false)
  const controllerRef = useRef(null)
  const rootRef = useRef(null)
  const optionRefs = useRef([])
  const id = useId()
  const lastMode = useRef('autocomplete')
  useEffect(() => {
    const controller = createPlaceSearch({ key: import.meta.env.VITE_GEOAPIFY_API_KEY,
      onState: value => { setState(value); setActiveIndex(-1) } })
    controllerRef.current = controller
    const outside = event => {
      if (!rootRef.current?.contains(event.target)) {
        controller.cancel(); setOpen(false); setState({ status: 'idle', results: [] }); setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => { controller.dispose(); document.removeEventListener('pointerdown', outside) }
  }, [])
  useEffect(() => { optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' }) }, [activeIndex])

  const search = (text, mode) => {
    lastMode.current = mode
    setOpen(true)
    controllerRef.current?.search(text, mode, getContext())
  }
  const select = result => {
    controllerRef.current?.cancel()
    setQuery(result.name)
    setOpen(false)
    setState({ status: 'idle', results: [] })
    setActiveIndex(-1)
    onSelect(result)
  }
  const submit = event => { event.preventDefault(); if (!composing.current) search(query, 'forward') }
  return <div ref={rootRef} className={`place-search${sidebarOpen ? ' sidebar-is-open' : ''}`}>
    <form className="place-search-form" role="search" onSubmit={submit}>
      <input aria-label="Search businesses, places, or addresses" role="combobox" aria-autocomplete="list"
        aria-expanded={open} aria-controls={`${id}-results`}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
        autoComplete="off" placeholder="Search businesses, places, addresses…" value={query}
        onChange={event => {
          setQuery(event.target.value)
          if (!composing.current) search(event.target.value, 'autocomplete')
        }}
        onCompositionStart={() => { composing.current = true; controllerRef.current?.cancel(); setOpen(false) }}
        onCompositionEnd={event => { composing.current = false; setQuery(event.currentTarget.value); search(event.currentTarget.value, 'autocomplete') }}
        onFocus={() => { if (state.status === 'ready' && query) setOpen(true) }}
        onKeyDown={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === 'Enter') event.preventDefault()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); controllerRef.current?.cancel(); setOpen(false)
            setState({ status: 'idle', results: [] }); setActiveIndex(-1)
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
            if (state.results.length) setActiveIndex(index => event.key === 'ArrowDown'
              ? (index + 1) % state.results.length : (index <= 0 ? state.results.length : index) - 1)
          }
          if (event.key === 'Enter' && open && activeIndex >= 0) {
            event.preventDefault(); select(state.results[activeIndex])
          }
        }} />
      <button type="submit" disabled={!normalizeQuery(query)}>Search</button>
    </form>
    {open && <div className="place-search-panel">
      <div className="place-search-status" role="status" aria-live="polite">
        {state.status === 'loading' ? 'Searching…' : state.status === 'waiting' ? 'Waiting for typing to pause…'
          : state.status === 'error' ? state.error
          : state.status === 'ready' ? state.results.length ? `${state.results.length} results. Use arrow keys to choose.` : 'No places found. Try adding a city or place a pin manually.'
          : 'Type at least 3 letters or numbers for suggestions, or press Search.'}
      </div>
      {state.status === 'error' && <button type="button" onClick={() => search(query, lastMode.current)}>Try again</button>}
      <ul id={`${id}-results`} role="listbox" aria-label="Places" aria-busy={state.status === 'loading'} className="place-search-results">
        {state.results.map((result, index) => <li key={result.id} id={`${id}-${index}`} role="option"
          ref={element => { optionRefs.current[index] = element }} aria-selected={index === activeIndex}
          onPointerDown={event => event.preventDefault()} onClick={() => select(result)}>
          <span className="place-search-name">{result.name}</span>
          <span className="place-search-address">{result.address}</span>
          {result.isArea && <span className="place-search-address">Area · show on map</span>}
        </li>)}
      </ul>
      <button type="button" className="place-search-manual" onClick={() => {
        controllerRef.current?.cancel(); setOpen(false); onManual()
      }}>Place a pin manually</button>
    </div>}
  </div>
}
