import { useState } from 'react'

type Props = { dueStart: string; due: string; onChange: (patch: { dueStart?: string; due?: string }) => void }

/** Prazo: uma data de entrega ou um período (de/até). Datas são opcionais. */
export function DueFields({ dueStart, due, onChange }: Props) {
  const [range, setRange] = useState(Boolean(dueStart && dueStart !== due))
  const invalid = Boolean(range && dueStart && due && dueStart > due)
  return (
    <fieldset className="due-fields">
      <legend>Prazo</legend>
      {range ? (
        <div className="due-fields__range">
          <label className="field"><span>De</span><input className="input" type="date" value={dueStart} max={due || undefined} onChange={(event) => onChange({ dueStart: event.target.value })} /></label>
          <label className="field"><span>Até</span><input className="input" type="date" value={due} min={dueStart || undefined} aria-invalid={invalid} onChange={(event) => onChange({ due: event.target.value })} /></label>
        </div>
      ) : (
        <label className="field"><span className="sr-only">Data de entrega</span><input className="input" type="date" value={due} onChange={(event) => onChange({ due: event.target.value, dueStart: '' })} /></label>
      )}
      {invalid && <p className="field__error" role="alert">A data final vem antes da inicial.</p>}
      <label className="switch">
        <input type="checkbox" checked={range} onChange={(event) => { setRange(event.target.checked); onChange({ dueStart: event.target.checked ? dueStart || due : '' }) }} />
        <span>Usar período (de/até)</span>
      </label>
    </fieldset>
  )
}
