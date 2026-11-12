import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDashed, Plus } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { dueLabel, dueTone, parseISODate } from '../../lib/dates'
import { briefing, summarize } from '../../lib/insights'
import type { Card } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { useAuth } from '../../state/auth'
import type { BoardContext } from '../shell/BoardLayout'

function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Visão geral: responde "o que eu preciso focar agora?" antes de mostrar qualquer número. */
export function OverviewView() {
  const { store, board, openCard, openNew, setFilters, clearFilters } = useOutletContext<BoardContext>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const summary = useMemo(() => summarize(store.cards, store.columns), [store.cards, store.columns])
  const brief = briefing(summary)
  const focus: Card[] = [...summary.late, ...summary.today, ...summary.week].slice(0, 8)
  const kanban = `/q/${board.id}/kanban`
  const openFiltered = (status: 'open' | 'done') => { clearFilters(); setFilters({ status }); navigate(kanban) }

  return (
    <div className="overview">
      <section className="hero">
        <Chiquinho mood={brief.mood} size={112} alt="" />
        <div className="hero__text">
          <p className="eyebrow">{greeting()}, {user?.name.split(' ')[0]}</p>
          <h1>{brief.title}</h1>
          <p>{brief.text}</p>
        </div>
        <div className="hero__actions">
          <button type="button" className="btn btn--primary" onClick={() => openNew()}><Plus size={18} aria-hidden /> Nova demanda</button>
          <button type="button" className="btn" onClick={() => navigate(kanban)}>Abrir Kanban <ArrowRight size={16} aria-hidden /></button>
        </div>
      </section>

      <section className="stats" aria-label="Resumo do quadro">
        <button type="button" className="stat" onClick={() => openFiltered('open')}><CircleDashed size={20} aria-hidden /><strong>{summary.open}</strong><span>Abertas</span></button>
        <div className={`stat ${summary.late.length ? 'stat--danger' : ''}`}><AlertTriangle size={20} aria-hidden /><strong>{summary.late.length}</strong><span>Atrasadas</span></div>
        <button type="button" className="stat" onClick={() => navigate(`/q/${board.id}/calendario`)}><CalendarClock size={20} aria-hidden /><strong>{summary.today.length + summary.week.length}</strong><span>Próximos 7 dias</span></button>
        <button type="button" className="stat stat--ok" onClick={() => openFiltered('done')}><CheckCircle2 size={20} aria-hidden /><strong>{summary.done}</strong><span>Concluídas</span></button>
      </section>

      <div className="overview__grid">
        <section className="panel">
          <header className="panel__header"><div><p className="eyebrow">Foco agora</p><h2>Atrasadas e próximas entregas</h2></div></header>
          {focus.length === 0 ? (
            <div className="panel__empty"><Chiquinho mood={summary.total ? 'happy' : 'sleepy'} size={56} /><p>{summary.total ? 'Nada com prazo nos próximos 7 dias.' : 'Sem demandas ainda.'}{summary.undated > 0 && ` ${summary.undated} sem data definida.`}</p></div>
          ) : (
            <ul className="focus-list">
              {focus.map((card) => {
                const date = parseISODate(card.due)
                return (
                  <li key={card.id}>
                    <button type="button" className="focus-item" onClick={() => openCard(card.id)}>
                      <span className={`datebox datebox--${dueTone(card.due)}`} aria-hidden><strong>{date?.getDate()}</strong><small>{date?.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></span>
                      <span className="focus-item__text"><strong>{card.title}</strong><small>{card.discipline || 'Sem disciplina'}</small></span>
                      <span className={`due due--${dueTone(card.due)}`}>{dueLabel(card.due)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="panel__header"><div><p className="eyebrow">Andamento</p><h2>{summary.progress}% concluído</h2></div></header>
          <div className="meter meter--lg" role="progressbar" aria-label="Demandas concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progress}><span style={{ width: `${summary.progress}%` }} /></div>
          <ul className="bars">
            {store.columns.map((column) => {
              const count = store.cards.filter((card) => card.column === column.id).length
              return (
                <li key={column.id}>
                  <span className="bars__label"><i style={{ background: column.color }} aria-hidden />{column.title}</span>
                  <span className="bars__track" aria-hidden><span style={{ width: `${summary.total ? (count / summary.total) * 100 : 0}%`, background: column.color }} /></span>
                  <span className="bars__count">{count}</span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
