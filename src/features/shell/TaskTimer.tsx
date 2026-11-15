import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Square, Timer } from 'lucide-react'
import { formatDuration } from '../../lib/dates'
import { taskSeconds } from '../../lib/insights'
import type { Card, Task } from '../../lib/types'

type Props = {
  cards: Card[]
  /** Demanda aberta no diálogo de detalhe: o timer dela já aparece lá, então some daqui. */
  openCardId: string | null
  onSave: (card: Card) => Promise<boolean>
  onOpen: (cardId: string) => void
}

/**
 * Timer de tarefa no cabeçalho: aparece quando há um timer rodando e o card está fechado.
 * Pausar mantém a tarefa aqui para continuar depois; parar tira ela do cabeçalho.
 */
export function TaskTimerPill({ cards, openCardId, onSave, onOpen }: Props) {
  // O banco só guarda "rodando ou não": qual tarefa foi pausada por aqui fica na memória da tela.
  const [paused, setPaused] = useState<{ cardId: string; taskId: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const running = useMemo(() => cards.flatMap((card) => (card.id === openCardId ? [] : card.tasks.filter((task) => task.timerStartedAt).map((task) => ({ card, task })))), [cards, openCardId])
  const pausedCard = paused && paused.cardId !== openCardId ? cards.find((card) => card.id === paused.cardId) : undefined
  const pausedTask = pausedCard?.tasks.find((task) => task.id === paused?.taskId && !task.done && !task.timerStartedAt)
  const current = running[0] ?? (pausedCard && pausedTask ? { card: pausedCard, task: pausedTask } : null)
  const ticking = Boolean(current?.task.timerStartedAt)

  useEffect(() => {
    if (!ticking) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [ticking, current?.task.id])

  if (!current) return null
  const { card, task } = current
  const others = running.length - (ticking ? 1 : 0)
  const update = (change: (item: Task) => Task) => void onSave({ ...card, tasks: card.tasks.map((item) => (item.id === task.id ? change(item) : item)) })
  const halt = (item: Task): Task => ({ ...item, elapsedSeconds: taskSeconds(item), timerStartedAt: null })
  const time = formatDuration(taskSeconds(task, now))

  return (
    <div className={`task-pill ${ticking ? '' : 'task-pill--paused'}`} role="group" aria-label={`Timer da tarefa ${task.title}`}>
      <button type="button" className="task-pill__main" onClick={() => onOpen(card.id)} title={`${task.title} — ${card.title}${ticking ? '' : ' (pausado)'}`} aria-label={`Abrir a demanda ${card.title}`}>
        <Timer size={16} aria-hidden />
        <strong>{time}</strong>
        <span className="task-pill__title">{task.title}</span>
        {others > 0 && <span className="task-pill__more" title={`Mais ${others} ${others === 1 ? 'timer rodando' : 'timers rodando'}`}>+{others}</span>}
      </button>
      {ticking
        ? <button type="button" className="icon-btn icon-btn--sm" aria-label={`Pausar timer de ${task.title}`} title="Pausar" onClick={() => { update(halt); setPaused({ cardId: card.id, taskId: task.id }) }}><Pause size={16} aria-hidden /></button>
        : <button type="button" className="icon-btn icon-btn--sm" aria-label={`Continuar timer de ${task.title}`} title="Continuar" onClick={() => update((item) => ({ ...item, timerStartedAt: new Date().toISOString() }))}><Play size={16} aria-hidden /></button>}
      <button type="button" className="icon-btn icon-btn--sm" aria-label={`Parar timer de ${task.title}`} title="Parar" onClick={() => { if (ticking) update(halt); setPaused(null) }}><Square size={14} aria-hidden /></button>
    </div>
  )
}
