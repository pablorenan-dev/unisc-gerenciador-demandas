import { daysUntil, isWeekend } from './dates'
import type { Mood } from '../state/feedback'
import type { Card, CardType, Column, Priority } from './types'

/** Uma demanda está concluída se está na última coluna do quadro ou se todas as suas tarefas foram feitas. */
export function isDone(card: Card, columns: Column[]): boolean {
  const last = columns[columns.length - 1]
  if (last && columns.length > 1 && card.column === last.id) return true
  return card.tasks.length > 0 && card.tasks.every((task) => task.done)
}

export type Filters = {
  search: string
  priority: 'all' | Priority
  type: 'all' | CardType
  discipline: string
  status: 'all' | 'open' | 'done'
}

export const emptyFilters: Filters = { search: '', priority: 'all', type: 'all', discipline: 'all', status: 'all' }

export function countActiveFilters(filters: Filters): number {
  return Number(Boolean(filters.search.trim())) + Number(filters.priority !== 'all') + Number(filters.type !== 'all') + Number(filters.discipline !== 'all') + Number(filters.status !== 'all')
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function matchesFilters(card: Card, filters: Filters, columns: Column[]): boolean {
  const query = normalize(filters.search.trim())
  if (query && !normalize(`${card.title} ${card.description} ${card.discipline}`).includes(query)) return false
  if (filters.priority !== 'all' && card.priority !== filters.priority) return false
  if (filters.type !== 'all' && card.type !== filters.type) return false
  if (filters.discipline !== 'all' && card.discipline !== filters.discipline) return false
  if (filters.status !== 'all' && isDone(card, columns) !== (filters.status === 'done')) return false
  return true
}

export type Summary = {
  total: number
  done: number
  open: number
  late: Card[]
  today: Card[]
  /** Abertas com prazo de amanhã até 7 dias. */
  week: Card[]
  /** Abertas sem prazo. */
  undated: number
  progress: number
}

export function summarize(cards: Card[], columns: Column[], now: Date = new Date()): Summary {
  const open = cards.filter((card) => !isDone(card, columns))
  const withDays = open.map((card) => ({ card, days: daysUntil(card.due, now) }))
  const byDue = (a: Card, b: Card) => a.due.localeCompare(b.due)
  const done = cards.length - open.length
  return {
    total: cards.length,
    done,
    open: open.length,
    late: withDays.filter((item) => item.days !== null && item.days < 0).map((item) => item.card).sort(byDue),
    today: withDays.filter((item) => item.days === 0).map((item) => item.card),
    week: withDays.filter((item) => item.days !== null && item.days >= 1 && item.days <= 7).map((item) => item.card).sort(byDue),
    undated: withDays.filter((item) => item.days === null).length,
    progress: cards.length ? Math.round((done / cards.length) * 100) : 0,
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** O "resumo do Chiquinho": uma frase sobre o que focar agora, com o humor correspondente. */
export function briefing(summary: Summary, now: Date = new Date()): { mood: Mood; title: string; text: string } {
  const weekend = isWeekend(now)
  if (summary.total === 0) return { mood: 'sleepy', title: 'Tudo vazio por aqui…', text: 'Crie sua primeira demanda e eu fico de olho nos prazos pra você.' }
  if (summary.open === 0) return { mood: 'party', title: 'Zerou tudo!', text: 'Nenhuma demanda aberta. Pode deitar no sofá igual eu.' }
  if (summary.late.length) return { mood: 'worried', title: `${plural(summary.late.length, 'demanda atrasada', 'demandas atrasadas')}.`, text: `Comece por "${summary.late[0].title}". Uma de cada vez, sem pânico.` }
  if (summary.today.length) return { mood: 'worried', title: `${plural(summary.today.length, 'entrega', 'entregas')} para hoje.`, text: `Foco em "${summary.today[0].title}". Depois a gente descansa.` }
  if (summary.week.length) {
    const first = summary.week[0]
    const days = daysUntil(first.due, now) ?? 0
    return {
      mood: 'curious',
      title: weekend ? 'Bom fim de semana pra adiantar.' : `${plural(summary.week.length, 'entrega', 'entregas')} nos próximos 7 dias.`,
      text: `A mais próxima é "${first.title}", ${days === 1 ? 'amanhã' : `em ${days} dias`}.`,
    }
  }
  return { mood: 'happy', title: 'Semana tranquila.', text: `${plural(summary.open, 'demanda aberta', 'demandas abertas')}, nenhuma com prazo nos próximos 7 dias.` }
}

export const idlePhrases = [
  'Um passo de cada vez.',
  'Respira, organiza e vai.',
  'Comece pela mais simples.',
  'Um pequeno progresso ainda é progresso.',
  'Pausa rápida e depois foco!',
  'Você não precisa fazer tudo de uma vez.',
  'Seu melhor de hoje já é suficiente.',
  'Eu confio em você. E em sachê.',
  'Estudar um pouquinho já faz diferença.',
  'Miau. (tradução: bora!)',
  'Já bebeu água hoje?',
  'Tô aqui sentado igual gente, te esperando terminar.',
]
