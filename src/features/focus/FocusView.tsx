import { useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { dueLabel, dueTone, formatDuration } from '../../lib/dates'
import { buildPlan, type PlanItem } from '../../lib/insights'
import { typeLabels } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { catSay, type Mood } from '../../state/feedback'
import type { BoardContext } from '../shell/BoardLayout'

/**
 * Plano de foco: a resposta para "é fim de semana, por onde eu começo?".
 * Mostra, em ordem, o que resolver primeiro e qual é o próximo passo de cada demanda.
 */
export default function FocusView() {
  const { store, openCard, openNew } = useOutletContext<BoardContext>()
  const plan = useMemo(() => buildPlan(store.cards, store.columns), [store.cards, store.columns])
  const lastColumn = store.columns[store.columns.length - 1]
  const [today] = useState(() => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))

  const steps = plan.overdue.length + plan.upcoming.length
  const mood: Mood = store.cards.length === 0 ? 'sleepy' : plan.total === 0 ? 'party' : plan.overdue.length ? 'worried' : steps ? 'curious' : 'happy'
  const title = plan.weekend ? 'Plano do fim de semana' : 'Plano de foco'
  const lead = store.cards.length === 0
    ? 'Ainda não há demandas. Crie a primeira e eu monto o plano.'
    : plan.total === 0
      ? 'Nada pendente com prazo. Pode descansar sem culpa.'
      : plan.overdue.length
        ? `Comece ${plan.overdue.length === 1 ? 'pela atrasada' : `pelas ${plan.overdue.length} atrasadas`}; depois siga a ordem abaixo. Um passo de cada vez.`
        : steps
          ? `${steps} ${steps === 1 ? 'entrega' : 'entregas'} nos próximos 7 dias. A ordem abaixo já está por prazo.`
          : 'Sem prazos apertados. Bom momento para adiantar o que já começou.'

  function completeStep(item: PlanItem) {
    const { card, nextTask } = item
    if (nextTask) {
      const tasks = card.tasks.map((task) => (task.id === nextTask.id ? { ...task, done: true, timerStartedAt: null } : task))
      void store.saveCard({ ...card, tasks }).then((ok) => {
        if (!ok) return
        const left = tasks.filter((task) => !task.done).length
        catSay(left ? `Boa! Faltam ${left} ${left === 1 ? 'passo' : 'passos'} em "${card.title}".` : `"${card.title}" concluída! Orgulho define.`, left ? 'happy' : 'party')
      })
    } else if (lastColumn) {
      void store.moveCard(card.id, lastColumn.id, null)
    }
  }

  const section = (heading: string, hint: string, items: PlanItem[], start: number) => items.length > 0 && (
    <section className="plan__section" aria-label={heading}>
      <header className="plan__heading"><h2>{heading}</h2><span>{hint}</span></header>
      <ol className="plan__list" start={start}>
        {items.map((item, index) => {
          const { card, nextTask } = item
          const done = card.tasks.filter((task) => task.done).length
          return (
            <li key={card.id} className="plan-item">
              <span className="plan-item__number" aria-hidden>{start + index}</span>
              <div className="plan-item__body">
                <button type="button" className="plan-item__title" onClick={() => openCard(card.id)}>{card.title}</button>
                <div className="plan-item__meta">
                  <span className={`chip chip--${card.type}`}>{typeLabels[card.type]}</span>
                  {card.discipline && <span>{card.discipline}</span>}
                  {card.due && <span className={`due due--${dueTone(card.due)}`}>{dueLabel(card.due)}</span>}
                  {card.tasks.length > 0 && <span>{done}/{card.tasks.length} tarefas</span>}
                  {item.spentSeconds > 0 && <span className="plan-item__time"><Clock3 size={13} aria-hidden /> {formatDuration(item.spentSeconds)}</span>}
                </div>
                <div className="plan-item__step">
                  <span className="plan-item__label">Próximo passo</span>
                  <span className="plan-item__next">{nextTask ? nextTask.title : card.tasks.length ? 'Tudo feito' : 'Sem tarefas: abra para dividir em passos, ou conclua direto.'}</span>
                </div>
              </div>
              <div className="plan-item__actions">
                <button type="button" className="btn btn--sm btn--primary" onClick={() => completeStep(item)} aria-label={nextTask ? `Marcar "${nextTask.title}" como feito` : `Concluir ${card.title}`}>
                  <Check size={15} aria-hidden /> {nextTask ? 'Feito' : 'Concluir'}
                </button>
                <button type="button" className="btn btn--sm" onClick={() => openCard(card.id)}>Abrir <ArrowRight size={14} aria-hidden /></button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )

  return (
    <div className="plan">
      <section className="hero">
        <Chiquinho mood={mood} size={112} />
        <div className="hero__text">
          <p className="eyebrow">{today}</p>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        {plan.total === 0 && <div className="hero__actions"><button type="button" className="btn btn--primary" onClick={() => openNew()}><Plus size={18} aria-hidden /> Nova demanda</button></div>}
      </section>
      {section('1. Resolver primeiro', 'atrasadas', plan.overdue, 1)}
      {section(`${plan.overdue.length ? '2' : '1'}. Entregas da semana`, 'vencem em até 7 dias', plan.upcoming, plan.overdue.length + 1)}
      {section('Se sobrar tempo, adiante', 'já começadas, sem prazo próximo', plan.advance, plan.overdue.length + plan.upcoming.length + 1)}
    </div>
  )
}
