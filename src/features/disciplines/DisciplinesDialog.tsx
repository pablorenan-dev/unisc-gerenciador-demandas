import { useId, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { disciplineColors, disciplineIcons, nextColor, suggestIcon, type DisciplineIcon as IconKey } from '../../lib/disciplines'
import { DISCIPLINE_NAME_MAX, type Discipline } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import type { BoardStore } from '../../state/board'
import { toast } from '../../state/feedback'
import { ConfirmDialog, Dialog } from '../../ui/Dialog'
import { DisciplineIcon } from './DisciplineIcon'

type Props = {
  store: BoardStore
  boardName: string
  /** Abre direto no formulário de nova disciplina. */
  startNew?: boolean
  /** Chamado ao criar (usado para já selecionar a disciplina no card em edição). */
  onCreated?: (discipline: Discipline) => void
  onClose: () => void
}

type Draft = { id: string | null; name: string; icon: IconKey; color: string; iconChosen: boolean }

/** Cadastro das disciplinas do quadro: nome, ícone e cor. */
export function DisciplinesDialog({ store, boardName, startNew, onCreated, onClose }: Props) {
  const { disciplines, cards } = store
  const formId = useId()
  const blank = (): Draft => ({ id: null, name: '', icon: 'book', color: nextColor(disciplines.map((item) => item.color)), iconChosen: false })
  const [draft, setDraft] = useState<Draft | null>(() => (startNew || disciplines.length === 0 ? blank() : null))
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<Discipline | null>(null)
  const countOf = (id: string) => cards.filter((card) => card.disciplineId === id).length

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || !draft.name.trim() || busy) return
    setBusy(true)
    const input = { name: draft.name, icon: draft.icon, color: draft.color }
    if (draft.id) {
      if (await store.updateDiscipline(draft.id, input)) setDraft(null)
    } else {
      const created = await store.addDiscipline(input)
      if (created) {
        toast.success(`Disciplina "${created.name}" criada.`)
        if (onCreated) { onCreated(created); onClose(); return }
        setDraft(null)
      }
    }
    setBusy(false)
  }

  if (!store.disciplinesReady) {
    return (
      <Dialog title="Disciplinas" eyebrow={boardName} onClose={onClose} footer={<button type="button" className="btn btn--primary" onClick={onClose}>Entendi</button>}>
        <div className="panel__empty"><Chiquinho mood="worried" size={64} /><p>O cadastro de disciplinas ainda não foi ativado no servidor. Aplique a migration <strong>0011_disciplines.sql</strong> no Supabase e recarregue a página.</p></div>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog title="Disciplinas" eyebrow={boardName} onClose={onClose}
        footer={draft ? <>
          {(draft.id || disciplines.length > 0) && !startNew && <button type="button" className="btn" onClick={() => setDraft(null)}>Voltar</button>}
          <button type="submit" form={formId} className="btn btn--primary" disabled={!draft.name.trim() || busy}>{busy ? 'Salvando…' : draft.id ? 'Salvar' : 'Criar disciplina'}</button>
        </> : <>
          <button type="button" className="btn" onClick={onClose}>Fechar</button>
          <button type="button" className="btn btn--primary" onClick={() => setDraft(blank())}><Plus size={17} aria-hidden /> Nova disciplina</button>
        </>}>
        {draft ? (
          <form id={formId} className="form" onSubmit={submit}>
            <div className="disc-form__top">
              <DisciplineIcon icon={draft.icon} color={draft.color} size={52} />
              <label className="field"><span>Nome da disciplina</span>
                <input className="input" data-autofocus required maxLength={DISCIPLINE_NAME_MAX} placeholder="Ex.: Banco de Dados II" value={draft.name}
                  onChange={(event) => { const name = event.target.value; setDraft((current) => current && { ...current, name, icon: current.iconChosen || current.id ? current.icon : suggestIcon(name) }) }} />
              </label>
            </div>
            <fieldset className="disc-form__group">
              <legend>Ícone</legend>
              <div className="icon-grid" role="radiogroup" aria-label="Ícone da disciplina">
                {disciplineIcons.map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={draft.icon === key} aria-label={label} title={label} className="icon-grid__item"
                    onClick={() => setDraft((current) => current && { ...current, icon: key, iconChosen: true })}>
                    <DisciplineIcon icon={key} color={draft.icon === key ? draft.color : 'var(--text-3)'} size={34} />
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="disc-form__group">
              <legend>Cor</legend>
              <div className="swatches swatches--inline" role="radiogroup" aria-label="Cor da disciplina">
                {disciplineColors.map((color) => (
                  <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={`Cor ${color}`} className="swatch" style={{ background: color }}
                    onClick={() => setDraft((current) => current && { ...current, color })} />
                ))}
              </div>
            </fieldset>
          </form>
        ) : (
          <ul className="disc-list">
            {disciplines.map((discipline) => {
              const count = countOf(discipline.id)
              return (
                <li key={discipline.id} className="disc-list__item">
                  <DisciplineIcon icon={discipline.icon} color={discipline.color} size={38} />
                  <span className="disc-list__text"><strong>{discipline.name}</strong><small>{count === 0 ? 'Nenhuma demanda' : `${count} ${count === 1 ? 'demanda' : 'demandas'}`}</small></span>
                  <button type="button" className="icon-btn" aria-label={`Editar ${discipline.name}`} onClick={() => setDraft({ ...discipline, iconChosen: true })}><Pencil size={17} aria-hidden /></button>
                  <button type="button" className="icon-btn" aria-label={`Excluir ${discipline.name}`} onClick={() => setRemoving(discipline)}><Trash2 size={17} aria-hidden /></button>
                </li>
              )
            })}
          </ul>
        )}
      </Dialog>
      {removing && (() => {
        const count = countOf(removing.id)
        return <ConfirmDialog danger title={`Excluir "${removing.name}"?`} confirmLabel="Excluir disciplina" onClose={() => setRemoving(null)} onConfirm={() => void store.deleteDiscipline(removing.id)}
          text={count ? `${count} ${count === 1 ? 'demanda continua existindo, mas fica' : 'demandas continuam existindo, mas ficam'} sem disciplina.` : 'Nenhuma demanda usa esta disciplina.'} />
      })()}
    </>
  )
}
