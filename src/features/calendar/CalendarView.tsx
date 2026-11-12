import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { addDays, dueLabel, dueTone, parseISODate, startOfWeek, toISODate } from '../../lib/dates'
import { isDone } from '../../lib/insights'
import type { Card } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import type { BoardContext } from '../shell/BoardLayout'

type Mode = 'month' | 'week' | 'list'
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function CalendarView() {
  const { visibleCards, store, openCard, openNew } = useOutletContext<BoardContext>()
  const [mode, setMode] = useState<Mode>(() => (window.matchMedia?.('(max-width: 720px)').matches ? 'list' : 'month'))
  const [cursor, setCursor] = useState(() => new Date())
  const [today] = useState(() => toISODate(new Date()))

  // Um card aparece no dia da entrega (ou em cada dia do período, quando há "de/até").
  const byDay = useMemo(() => {
    const map = new Map<string, Card[]>()
    visibleCards.forEach((card) => {
      const end = parseISODate(card.due)
      if (!end) return
      const start = parseISODate(card.dueStart) ?? end
      for (let day = start <= end ? start : end, guard = 0; day <= end && guard < 62; day = addDays(day, 1), guard += 1) {
        const key = toISODate(day)
        map.set(key, [...(map.get(key) ?? []), card])
      }
    })
    return map
  }, [visibleCards])

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(monthStart)
  const weekStart = startOfWeek(cursor)
  const days = mode === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) : Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  const visibleDays = mode === 'month' && days[35].getMonth() !== cursor.getMonth() ? days.slice(0, 35) : days
  const title = mode === 'week'
    ? `${weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const move = (direction: -1 | 1) => setCursor((current) => (mode === 'week' ? addDays(current, direction * 7) : new Date(current.getFullYear(), current.getMonth() + direction, 1)))

  const listCards = useMemo(() => visibleCards
    .filter((card) => { const date = parseISODate(card.due); return date && date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth() })
    .sort((a, b) => a.due.localeCompare(b.due)), [visibleCards, cursor])
  const undated = visibleCards.filter((card) => !card.due).length

  return (
    <div className="calendar">
      <header className="calendar__bar">
        <div className="calendar__nav">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label={mode === 'week' ? 'Semana anterior' : 'Mês anterior'}><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" className="btn btn--sm" onClick={() => setCursor(new Date())}>Hoje</button>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label={mode === 'week' ? 'Próxima semana' : 'Próximo mês'}><ChevronRight size={20} aria-hidden /></button>
          <h1 className="calendar__title" aria-live="polite">{title}</h1>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Modo do calendário">
          {([['month', 'Mês'], ['week', 'Semana'], ['list', 'Lista']] as [Mode, string][]).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => setMode(value)}>{label}</button>
          ))}
        </div>
      </header>

      {mode === 'list' ? (
        listCards.length === 0 ? (
          <div className="panel__empty panel__empty--tall"><Chiquinho mood="sleepy" size={72} /><p>Nenhuma entrega neste mês.</p></div>
        ) : (
          <ul className="focus-list calendar__list">
            {listCards.map((card) => {
              const date = parseISODate(card.due)
              const done = isDone(card, store.columns)
              return (
                <li key={card.id}>
                  <button type="button" className="focus-item" onClick={() => openCard(card.id)}>
                    <span className={`datebox datebox--${done ? 'done' : dueTone(card.due)}`} aria-hidden><strong>{date?.getDate()}</strong><small>{date?.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small></span>
                    <span className="focus-item__text"><strong>{card.title}</strong><small>{card.discipline || 'Sem disciplina'}</small></span>
                    <span className={`due due--${done ? 'done' : dueTone(card.due)}`}>{done ? 'Concluída' : dueLabel(card.due)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <div className={`calendar__scroll calendar__scroll--${mode}`}>
          <div className={`grid grid--${mode}`} role="grid" aria-label={title}>
            {weekdays.map((day) => <div key={day} className="grid__weekday" role="columnheader">{day}</div>)}
            {visibleDays.map((date) => {
              const key = toISODate(date)
              const cards = byDay.get(key) ?? []
              const outside = mode === 'month' && date.getMonth() !== cursor.getMonth()
              const limit = mode === 'month' ? 3 : 20
              return (
                <div key={key} role="gridcell" className={`day ${outside ? 'day--outside' : ''} ${key === today ? 'day--today' : ''}`}>
                  <div className="day__head">
                    <span className="day__number" aria-label={date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}>{date.getDate()}</span>
                    <button type="button" className="day__add" onClick={() => openNew({ due: key })} aria-label={`Nova demanda para ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`}><Plus size={14} aria-hidden /></button>
                  </div>
                  {cards.slice(0, limit).map((card) => (
                    <button key={card.id} type="button" className={`event event--${isDone(card, store.columns) ? 'done' : dueTone(card.due)}`} onClick={() => openCard(card.id)} title={card.title}>{card.title}</button>
                  ))}
                  {cards.length > limit && <button type="button" className="event event--more" onClick={() => { setCursor(date); setMode('week') }}>+{cards.length - limit} mais</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {undated > 0 && <p className="calendar__note">{undated} {undated === 1 ? 'demanda sem data não aparece' : 'demandas sem data não aparecem'} no calendário.</p>}
    </div>
  )
}
