import { useId, useState } from 'react'
import { priorityLabels, TITLE_MAX, typeLabels, type Card, type CardType, type Column, type Priority } from '../../lib/types'
import type { NewCard } from '../../state/board'
import { toast } from '../../state/feedback'
import { Dialog } from '../../ui/Dialog'
import { DueFields } from './DueFields'

type Props = {
  columns: Column[]
  disciplines: string[]
  preset: { column?: string; due?: string }
  onClose: () => void
  onCreate: (input: NewCard) => Promise<Card | null>
}

export function NewCardDialog({ columns, disciplines, preset, onClose, onCreate }: Props) {
  const formId = useId()
  const listId = useId()
  const [title, setTitle] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [column, setColumn] = useState(preset.column ?? columns[0]?.id ?? '')
  const [type, setType] = useState<CardType>('trabalho')
  const [priority, setPriority] = useState<Priority>('media')
  const [dates, setDates] = useState({ dueStart: '', due: preset.due ?? '' })
  const [busy, setBusy] = useState(false)
  const invalidRange = Boolean(dates.dueStart && dates.due && dates.dueStart > dates.due)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || invalidRange || busy) return
    setBusy(true)
    const created = await onCreate({ title, discipline: discipline.trim(), column, type, priority, ...dates })
    setBusy(false)
    if (created) { toast.success('Demanda criada.'); onClose() }
  }

  return (
    <Dialog title="O que precisa ser feito?" eyebrow="Nova demanda" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      <button type="submit" form={formId} className="btn btn--primary" disabled={!title.trim() || invalidRange || busy}>{busy ? 'Criando…' : 'Criar demanda'}</button>
    </>}>
      <form id={formId} className="form" onSubmit={submit}>
        <label className="field"><span>Título</span>
          <input className="input" data-autofocus required maxLength={TITLE_MAX} placeholder="Ex.: Lista de exercícios 3" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="form__row">
          <label className="field"><span>Disciplina <em>(opcional)</em></span>
            <input className="input" list={listId} maxLength={120} placeholder="Ex.: Estruturas de Dados" value={discipline} onChange={(event) => setDiscipline(event.target.value)} />
            <datalist id={listId}>{disciplines.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <label className="field"><span>Coluna</span>
            <select className="select" value={column} onChange={(event) => setColumn(event.target.value)}>{columns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
          </label>
        </div>
        <div className="form__row">
          <label className="field"><span>Tipo</span>
            <select className="select" value={type} onChange={(event) => setType(event.target.value as CardType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="field"><span>Prioridade</span>
            <select className="select" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
        </div>
        <DueFields dueStart={dates.dueStart} due={dates.due} onChange={(patch) => setDates((current) => ({ ...current, ...patch }))} />
        {/* Garante o envio com Enter em qualquer campo (o botão visível fica no rodapé, fora do form). */}
        <button type="submit" hidden tabIndex={-1} aria-hidden />
      </form>
    </Dialog>
  )
}
