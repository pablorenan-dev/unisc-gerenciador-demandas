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

/** Frases de incentivo do Chiquinho (as originais do app, mais algumas). */
export const idlePhrases = [
  'Você consegue!',
  'Se organiza para estudar um pouquinho no final de semana!',
  'Um passo de cada vez.',
  'Seu esforço vai valer a pena!',
  'Bora vencer essa demanda!',
  'Você está indo muito bem!',
  'Pausa rápida e depois foco!',
  'Seu futuro agradece o esforço de hoje!',
  'Estudar um pouquinho já faz diferença!',
  'Você é capaz!',
  'Eu confio em você!',
  'Só se organizar e começar!',
  'Você não precisa fazer tudo de uma vez.',
  'Acredite mais em você.',
  'Você já superou muita coisa.',
  'Seu ritmo também é válido.',
  'Errar faz parte de aprender.',
  'Você merece reconhecer seu esforço.',
  'Comece pelo mais simples.',
  'Você tem mais força do que imagina.',
  'Um pequeno progresso ainda é progresso.',
  'Não se compare: cada pessoa tem seu tempo.',
  'Você está aprendendo, e isso já é incrível.',
  'Respira, organiza e vai.',
  'Seu melhor de hoje já é suficiente.',
  'Você pode pedir ajuda quando precisar.',
  'Confie no processo.',
  'Você não está atrasado: está no seu caminho.',
  'Sua dedicação importa.',
  'Tenha paciência com você.',
  'Você consegue superar esta etapa.',
  'Faça uma coisa de cada vez.',
  'Você tem motivos para se orgulhar.',
  'Seu esforço não passa despercebido.',
  'Você é importante, mesmo nos dias difíceis.',
  'Continue: você está mais perto do que pensa.',
  'Hoje é um bom dia para recomeçar.',
  ']',
  'Eu confio em você. E em sachê.',
  'Miau. (tradução: bora!)',
  'Já bebeu água hoje?',
  'Tô aqui sentado igual gente, te esperando terminar.',
  'Fecha as outras abas. Eu vi.',
  'Cinco minutinhos de foco e eu paro de te olhar assim.',
  'Se eu consigo sentar desse jeito, você consegue entregar isso.',
]

/* ------------------------------ Plano de foco ------------------------------ */

export type PlanItem = {
  card: Card
  /** Próxima tarefa ainda não feita, se o card tiver tarefas. */
  nextTask: Card['tasks'][number] | null
  /** Tempo já registrado nos timers das tarefas, em segundos. */
  spentSeconds: number
}

export type Plan = {
  weekend: boolean
  /** Atrasadas: resolver primeiro. */
  overdue: PlanItem[]
  /** Com entrega de hoje até 7 dias. */
  upcoming: PlanItem[]
  /** Já começadas (fora da primeira coluna) sem prazo próximo: boas para adiantar. */
  advance: PlanItem[]
  total: number
}

const priorityRank: Record<Card['priority'], number> = { critica: 0, urgente: 1, alta: 2, media: 3, baixa: 4 }

function toPlanItem(card: Card): PlanItem {
  return {
    card,
    nextTask: card.tasks.find((task) => !task.done) ?? null,
    spentSeconds: card.tasks.reduce((total, task) => total + task.elapsedSeconds, 0),
  }
}

/**
 * Monta o plano "o que focar agora" (pensado para sexta à noite e fim de semana):
 * primeiro o que está atrasado, depois o que vence em até 7 dias, depois o que já está em andamento.
 */
export function buildPlan(cards: Card[], columns: Column[], now: Date = new Date()): Plan {
  const open = cards.filter((card) => !isDone(card, columns))
  const byUrgency = (a: Card, b: Card) => (a.due || '9999').localeCompare(b.due || '9999') || priorityRank[a.priority] - priorityRank[b.priority]
  const days = (card: Card) => daysUntil(card.due, now)
  const overdue = open.filter((card) => { const left = days(card); return left !== null && left < 0 }).sort(byUrgency)
  const upcoming = open.filter((card) => { const left = days(card); return left !== null && left >= 0 && left <= 7 }).sort(byUrgency)
  const taken = new Set([...overdue, ...upcoming].map((card) => card.id))
  const firstColumn = columns[0]?.id
  const advance = open
    .filter((card) => !taken.has(card.id) && (card.column !== firstColumn || card.tasks.some((task) => task.done)))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || byUrgency(a, b))
    .slice(0, 5)
  return {
    weekend: isWeekend(now) || now.getDay() === 5,
    overdue: overdue.map(toPlanItem),
    upcoming: upcoming.map(toPlanItem),
    advance: advance.map(toPlanItem),
    total: overdue.length + upcoming.length + advance.length,
  }
}
