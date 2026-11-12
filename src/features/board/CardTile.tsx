import { CalendarClock, CheckCircle2, Copy, Flag, ListChecks, MessageSquareText, MoreHorizontal, MoveRight, Pencil, Timer, Trash2 } from 'lucide-react'
import { dueLabel, dueTone, formatRange } from '../../lib/dates'
import { priorityLabels, typeLabels, type Card, type Column, type Discipline } from '../../lib/types'
import { DisciplineTag } from '../disciplines/DisciplineIcon'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu'

type Props = {
  card: Card
  done: boolean
  discipline?: Discipline
  columns?: Column[]
  onOpen?: () => void
  onMove?: (columnId: string) => void
  onDuplicate?: () => void
  onDelete?: () => void
}

/** Conteúdo visual de uma demanda no quadro. Usado na coluna e no "fantasma" do arraste. */
export function CardTile({ card, done, discipline, columns, onOpen, onMove, onDuplicate, onDelete }: Props) {
  const tasksDone = card.tasks.filter((task) => task.done).length
  const tone = done ? 'done' : dueTone(card.due)
  const timing = card.tasks.some((task) => task.timerStartedAt)
  const range = card.dueStart && card.dueStart !== card.due
  return (
    <>
      <div className="card__top">
        <span className={`chip chip--${card.type}`}>{typeLabels[card.type]}</span>
        {card.priority !== 'media' && card.priority !== 'baixa' && (
          <span className={`flag flag--${card.priority}`}><Flag size={12} aria-hidden /> {priorityLabels[card.priority]}</span>
        )}
        {columns && (
          <span className="card__menu">
            <Menu label={`Opções de ${card.title}`} trigger={<MoreHorizontal size={18} aria-hidden />} triggerClassName="icon-btn icon-btn--sm">
              {(close) => <>
                <MenuItem icon={<Pencil size={16} />} onSelect={() => { close(); onOpen?.() }}>Abrir e editar</MenuItem>
                <MenuItem icon={<Copy size={16} />} onSelect={() => { close(); onDuplicate?.() }}>Duplicar</MenuItem>
                <MenuSeparator />
                <MenuLabel>Mover para</MenuLabel>
                {columns.map((column) => (
                  <MenuItem key={column.id} icon={<MoveRight size={16} />} disabled={column.id === card.column} onSelect={() => { close(); onMove?.(column.id) }}>{column.title}</MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem danger icon={<Trash2 size={16} />} onSelect={() => { close(); onDelete?.() }}>Excluir</MenuItem>
              </>}
            </Menu>
          </span>
        )}
      </div>
      <h3 className="card__title">{card.title}</h3>
      {card.discipline && <div className="card__discipline"><DisciplineTag discipline={discipline} name={card.discipline} /></div>}
      {(card.due || card.tasks.length > 0 || card.notesCount > 0 || done) && (
        <div className="card__meta">
          {card.due && (
            <span className={`due due--${tone}`} title={range ? formatRange(card.dueStart, card.due) : undefined}>
              {done ? <CheckCircle2 size={14} aria-hidden /> : <CalendarClock size={14} aria-hidden />}
              {done ? formatRange(card.dueStart, card.due) : range ? formatRange(card.dueStart, card.due) : dueLabel(card.due)}
            </span>
          )}
          {!card.due && done && <span className="due due--done"><CheckCircle2 size={14} aria-hidden /> Concluída</span>}
          {card.tasks.length > 0 && (
            <span className={`tasks-count ${tasksDone === card.tasks.length ? 'tasks-count--done' : ''}`} aria-label={`${tasksDone} de ${card.tasks.length} tarefas feitas`}>
              <ListChecks size={14} aria-hidden /> {tasksDone}/{card.tasks.length}
            </span>
          )}
          {card.notesCount > 0 && <span className="tasks-count" aria-label={`${card.notesCount} ${card.notesCount === 1 ? 'observação' : 'observações'}`}><MessageSquareText size={14} aria-hidden /> {card.notesCount}</span>}
          {timing && <span className="timing" title="Timer rodando"><Timer size={14} aria-hidden /></span>}
        </div>
      )}
      {card.tasks.length > 0 && tasksDone < card.tasks.length && (
        <div className="meter" aria-hidden><span style={{ width: `${(tasksDone / card.tasks.length) * 100}%` }} /></div>
      )}
    </>
  )
}
