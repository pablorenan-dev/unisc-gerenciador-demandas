import { useEffect, useState } from 'react'
import { Check, Copy, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { formatDuration } from '../../lib/dates'
import { priorityLabels, TITLE_MAX, typeLabels, type Card, type CardType, type Column, type Discipline, type Priority, type Task } from '../../lib/types'
import { catSay, toast } from '../../state/feedback'
import { ConfirmDialog, Dialog } from '../../ui/Dialog'
import { DisciplineSelect } from '../disciplines/DisciplineSelect'
import { DueFields } from './DueFields'
import { NotesSection } from './NotesSection'

type Props = {
  card: Card
  columns: Column[]
  boardId: string
  boardName: string
  /** Falso enquanto o banco não tem observações (migration 0012). */
  notesReady: boolean
  onNotesCount: (count: number) => void
  disciplines: Discipline[]
  /** Falso enquanto o banco não tem o cadastro de disciplinas: o campo volta a ser texto livre. */
  disciplinesReady: boolean
  onNewDiscipline: (onCreated: (discipline: Discipline) => void) => void
  onClose: () => void
  onSave: (card: Card) => Promise<boolean>
  onDelete: () => void
  onDuplicate: () => void
}

const fieldsOf = (card: Card) => JSON.stringify([card.title, card.description, card.disciplineId, card.discipline, card.type, card.priority, card.dueStart, card.due, card.column])

/**
 * Detalhe da demanda. Os campos são salvos pelo botão "Salvar";
 * a lista de tarefas (marcar, adicionar, remover, timer) é salva na hora, como um checklist.
 */
export function CardDialog({ card, columns, boardId, boardName, notesReady, onNotesCount, disciplines, disciplinesReady, onNewDiscipline, onClose, onSave, onDelete, onDuplicate }: Props) {
  const [draft, setDraft] = useState(card)
  const [newTask, setNewTask] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null)

  const tasks = card.tasks
  const running = tasks.some((task) => task.timerStartedAt)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const dirty = fieldsOf(draft) !== fieldsOf(card)
  const [notesDirty, setNotesDirty] = useState(false)
  const invalidRange = Boolean(draft.dueStart && draft.due && draft.dueStart > draft.due)
  const canSave = dirty && draft.title.trim().length > 0 && !invalidRange && !saving
  const set = (patch: Partial<Card>) => setDraft((current) => ({ ...current, ...patch }))
  const elapsed = (task: Task) => task.elapsedSeconds + (task.timerStartedAt ? Math.max(0, Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000)) : 0)
  const completed = tasks.filter((task) => task.done).length

  /** Tarefas são gravadas imediatamente sobre a versão já salva do card (sem levar junto campos em edição). */
  function persistTasks(next: Task[]) {
    const allDone = next.length > 0 && next.every((task) => task.done)
    const wasDone = tasks.length > 0 && tasks.every((task) => task.done)
    void onSave({ ...card, tasks: next }).then((ok) => { if (ok && allDone && !wasDone) catSay('Todas as tarefas feitas! Isso merece um sachê.', 'party') })
  }

  function addTask() {
    const title = newTask.trim().slice(0, TITLE_MAX)
    if (!title) return
    persistTasks([...tasks, { id: crypto.randomUUID(), title, done: false, elapsedSeconds: 0, timerStartedAt: null }])
    setNewTask('')
  }

  const updateTask = (id: string, patch: Partial<Task>) => persistTasks(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)))

  async function save() {
    if (!canSave) return
    setSaving(true)
    const ok = await onSave({ ...draft, tasks })
    setSaving(false)
    if (ok) { toast.success('Alterações salvas.'); onClose() }
  }

  const requestClose = () => (dirty || notesDirty ? setConfirm('discard') : onClose())
  const column = columns.find((item) => item.id === draft.column)

  return (
    <>
      <Dialog title={`Demanda: ${card.title}`} size="lg" onClose={requestClose}
        header={<div className="detail__crumbs"><span className={`chip chip--${draft.type}`}>{typeLabels[draft.type]}</span><span>{boardName}</span><span aria-hidden>›</span><span>{column?.title}</span></div>}
        footer={<>
          <div className="dialog__footer-start">
            <button type="button" className="btn btn--ghost" onClick={onDuplicate}><Copy size={16} aria-hidden /> Duplicar</button>
            <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => setConfirm('delete')}><Trash2 size={16} aria-hidden /> Excluir</button>
          </div>
          <button type="button" className="btn" onClick={requestClose}>{dirty ? 'Cancelar' : 'Fechar'}</button>
          <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!canSave}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </>}>
        <div className="detail">
          <section className="detail__main">
            <label className="field">
              <span className="sr-only">Título</span>
              <textarea className="input detail__title" rows={1} maxLength={TITLE_MAX} value={draft.title} placeholder="Título da demanda" aria-invalid={!draft.title.trim()}
                onChange={(event) => set({ title: event.target.value.replace(/\n/g, ' ') })}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save() } }} />
            </label>
            {!draft.title.trim() && <p className="field__error" role="alert">A demanda precisa de um título.</p>}
            <label className="field">
              <span>Descrição</span>
              <textarea className="input" rows={4} maxLength={5000} value={draft.description} placeholder="Detalhes, links, combinados com o grupo…" onChange={(event) => set({ description: event.target.value })} />
            </label>

            <div className="tasks">
              <div className="tasks__heading">
                <h3>Tarefas</h3>
                <span className="tasks__total">{completed}/{tasks.length}</span>
              </div>
              {tasks.length > 0 && <div className="meter meter--lg" role="progressbar" aria-label="Progresso das tarefas" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={completed}><span style={{ width: `${(completed / tasks.length) * 100}%` }} /></div>}
              <ul className="tasks__list">
                {tasks.map((task) => (
                  <li key={task.id} className={`task ${task.done ? 'task--done' : ''}`}>
                    <button type="button" role="checkbox" aria-checked={task.done} aria-label={task.title} className="check" onClick={() => updateTask(task.id, { done: !task.done })}>{task.done && <Check size={14} aria-hidden />}</button>
                    <span className="task__title">{task.title}</span>
                    <span className={`task__time ${task.timerStartedAt ? 'task__time--on' : ''}`}>{formatDuration(elapsed(task))}</span>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={task.timerStartedAt ? `Pausar timer de ${task.title}` : `Iniciar timer de ${task.title}`} title={task.timerStartedAt ? 'Pausar timer' : 'Iniciar timer'}
                      onClick={() => updateTask(task.id, task.timerStartedAt ? { elapsedSeconds: elapsed(task), timerStartedAt: null } : { timerStartedAt: new Date().toISOString() })}>
                      {task.timerStartedAt ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remover tarefa ${task.title}`} onClick={() => persistTasks(tasks.filter((item) => item.id !== task.id))}><X size={16} aria-hidden /></button>
                  </li>
                ))}
              </ul>
              <form className="tasks__add" onSubmit={(event) => { event.preventDefault(); addTask() }}>
                <input className="input" placeholder="Adicionar tarefa…" aria-label="Nova tarefa" maxLength={TITLE_MAX} value={newTask} onChange={(event) => setNewTask(event.target.value)} />
                <button type="submit" className="btn" disabled={!newTask.trim()}><Plus size={16} aria-hidden /> Adicionar</button>
              </form>
            </div>

            {notesReady
              ? <NotesSection boardId={boardId} cardId={card.id} onCount={onNotesCount} onDirty={setNotesDirty} />
              : <p className="notes__status">Observações com imagens ficam disponíveis depois que a migration 0012 for aplicada no Supabase.</p>}
          </section>

          <aside className="detail__side">
            <label className="field"><span>Coluna</span>
              <select className="select" value={draft.column} onChange={(event) => set({ column: event.target.value })}>{columns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
            </label>
            <DueFields dueStart={draft.dueStart} due={draft.due} onChange={set} />
            <label className="field"><span>Tipo</span>
              <select className="select" value={draft.type} onChange={(event) => set({ type: event.target.value as CardType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
            <label className="field"><span>Prioridade</span>
              <select className="select" value={draft.priority} onChange={(event) => set({ priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
            <label className="field"><span>Disciplina</span>
              {disciplinesReady ? (
                <DisciplineSelect disciplines={disciplines} value={draft.disciplineId} legacyName={draft.discipline}
                  onChange={(id) => set({ disciplineId: id, discipline: disciplines.find((item) => item.id === id)?.name ?? '' })}
                  onCreate={() => onNewDiscipline((created) => set({ disciplineId: created.id, discipline: created.name }))} />
              ) : (
                <input className="input" maxLength={120} value={draft.discipline} placeholder="Ex.: Banco de Dados" onChange={(event) => set({ discipline: event.target.value })} />
              )}
            </label>
          </aside>
        </div>
      </Dialog>
      {confirm === 'discard' && <ConfirmDialog title="Descartar alterações?" text={dirty ? 'Você editou esta demanda e ainda não salvou.' : 'Há uma observação escrita que ainda não foi salva.'} confirmLabel="Descartar" danger onClose={() => setConfirm(null)} onConfirm={onClose} />}
      {confirm === 'delete' && <ConfirmDialog title="Excluir esta demanda?" text="Ela some do quadro junto com as tarefas. Você ainda tem alguns segundos para desfazer." confirmLabel="Excluir" danger onClose={() => setConfirm(null)} onConfirm={onDelete} />}
    </>
  )
}
