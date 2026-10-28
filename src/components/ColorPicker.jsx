import { useId } from 'react'
import { COLOR_PRESETS, normalizeHex } from '../colors'
import './ColorPicker.css'

export default function ColorPicker({ value, onChange }) {
  const id = useId()
  const selected = normalizeHex(value)
  return <div className="color-picker">
    <div className="color-current"><span className="color-preview" style={{ background: selected || 'transparent' }} />
      <span>Selected color <strong>{selected || 'Invalid hex color'}</strong></span></div>
    <div className="color-presets" role="group" aria-label="Preset colors">
      {COLOR_PRESETS.map(color => <button key={color} type="button" className="color-swatch" aria-label={`Use ${color}`}
        aria-pressed={selected === color} onClick={() => onChange(color)}>
        <span style={{ background: color }} />{selected === color && <span className="color-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>
    <label htmlFor={id}>Custom hex color</label>
    <input id={id} value={value} spellCheck={false} autoComplete="off" maxLength={7} aria-invalid={!selected}
      aria-describedby={!selected ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)} />
    {!selected && <p id={`${id}-error`} className="field-error" role="alert">Use a hex color such as #3388ff.</p>}
  </div>
}
