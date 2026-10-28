import { useId, useRef, useState } from 'react'
import { COLOR_PRESETS, normalizeHex, hexToHsv, hsvToHex, hsvFromPoint, adjustHsv } from '../colors'
import './ColorPicker.css'

export default function ColorPicker({ value, onChange, disabled = false }) {
  const id = useId()
  const selected = normalizeHex(value)
  const pointer = useRef(null)
  const [draft, setDraft] = useState(() => ({ source: value, hsv: hexToHsv(value) || { h: 210, s: 80, v: 100 } }))
  let hsv = draft.hsv
  // Sync external hex/preset changes, while retaining exact HSV coordinates
  // during dragging (including hue/saturation choices at black or gray).
  if (draft.source !== value) {
    hsv = hexToHsv(value, draft.hsv.h) || draft.hsv
    setDraft({ source: value, hsv })
  }
  const commit = next => {
    if (disabled || !next) return
    const hex = hsvToHex(next)
    setDraft({ source: hex, hsv: next })
    onChange(hex)
  }
  const choosePoint = event => commit(hsvFromPoint(hsv, event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY))
  const endDrag = event => {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div className="color-picker">
    <div className="color-current"><span className="color-preview" style={{ background: selected || 'transparent' }} />
      <span>Selected color <strong>{selected || 'Invalid hex color'}</strong></span></div>
    <div className="color-presets" role="group" aria-label="Preset colors">
      {COLOR_PRESETS.map(color => <button key={color} type="button" className="color-swatch" aria-label={`Use ${color}`}
        disabled={disabled} aria-pressed={selected === color} onClick={() => onChange(color)}>
        <span style={{ background: color }} />{selected === color && <span className="color-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>
    <div className="color-sv" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      aria-label="Saturation and brightness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s)}
      aria-valuetext={`Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`}
      aria-describedby={`${id}-instructions`}
      style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        pointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        choosePoint(event)
      }}
      onPointerMove={event => { if (pointer.current === event.pointerId) choosePoint(event) }}
      onPointerUp={event => { if (pointer.current === event.pointerId) choosePoint(event); endDrag(event) }}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => { pointer.current = null }}
      onKeyDown={event => {
        if (disabled) return
        const next = adjustHsv(hsv, event.key, event.shiftKey)
        if (next) { event.preventDefault(); event.stopPropagation(); commit(next) }
      }}>
      <span className="color-sv-cursor" aria-hidden="true" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
    </div>
    <span id={`${id}-instructions`} className="color-picker-instructions">Left and right adjust saturation; up and down adjust brightness. Hold Shift for larger steps. Home and End set saturation limits; Page Up and Page Down set brightness limits.</span>
    <label htmlFor={`${id}-hue`}>Hue</label>
    <input id={`${id}-hue`} className="color-hue" type="range" min="0" max="360" step="1" value={hsv.h}
      disabled={disabled} aria-valuetext={`${Math.round(hsv.h)} degrees`} style={{ '--hue-color': `hsl(${hsv.h} 100% 50%)` }}
      onChange={event => commit({ ...hsv, h: Number(event.target.value) })} />
    <label htmlFor={id}>Custom hex color</label>
    <input id={id} disabled={disabled} value={value} spellCheck={false} autoComplete="off" maxLength={7} aria-invalid={!selected}
      aria-describedby={!selected ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)} />
    {!selected && <p id={`${id}-error`} className="field-error" role="alert">Use a hex color such as #3388ff.</p>}
  </div>
}
