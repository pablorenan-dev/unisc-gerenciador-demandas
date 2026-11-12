import { describe, expect, it } from 'vitest'
import { safeColor } from './api'
import { daysUntil, dueLabel, dueTone, formatDuration, parseISODate, startOfWeek, toISODate } from './dates'
import { briefing, buildPlan, emptyFilters, isDone, matchesFilters, summarize } from './insights'
import { planMove } from './order'
import { friendlyError } from './supabase'
import type { Card, Column } from './types'

const now = new Date(2026, 10, 12, 15, 30) // 12/nov/2026, quinta-feira à tarde

const columns: Column[] = [
  { id: 'todo', title: 'A fazer', color: '#000', position: 1000 },
  { id: 'done', title: 'Concluído', color: '#000', position: 2000 },
]
const card = (patch: Partial<Card>): Card => ({ id: 'c', column: 'todo', position: 1000, title: 'Demanda', description: '', discipline: '', type: 'trabalho', priority: 'media', dueStart: '', due: '', labels: [], tasks: [], ...patch })

describe('datas', () => {
  it('usa a data de hoje, e não uma data fixa, para calcular o prazo', () => {
    expect(daysUntil('2026-11-12', now)).toBe(0)
    expect(daysUntil('2026-11-13', now)).toBe(1)
    expect(daysUntil('2026-11-10', now)).toBe(-2)
    expect(daysUntil('2027-01-01', new Date(2026, 11, 31, 23, 59))).toBe(1)
  })

  it('trata demanda sem data como "sem data", sem inventar prazo', () => {
    expect(daysUntil('', now)).toBeNull()
    expect(dueTone('', now)).toBe('none')
    expect(dueLabel('', now)).toBe('Sem data')
    expect(parseISODate('2026-13-45x')).toBeNull()
  })

  it('não desloca o dia por causa do fuso horário', () => {
    expect(toISODate(parseISODate('2026-03-01') as Date)).toBe('2026-03-01')
    expect(toISODate(startOfWeek(new Date(2026, 10, 15)))).toBe('2026-11-09') // domingo → segunda anterior
  })

  it('descreve o prazo em português', () => {
    expect(dueLabel('2026-11-12', now)).toBe('Hoje')
    expect(dueLabel('2026-11-13', now)).toBe('Amanhã')
    expect(dueLabel('2026-11-09', now)).toBe('Atrasada há 3 dias')
    expect(dueTone('2026-11-09', now)).toBe('late')
    expect(dueTone('2026-11-14', now)).toBe('soon')
    expect(formatDuration(3725)).toBe('1h 02:05')
  })
})

describe('ordenação', () => {
  const list = [{ id: 'a', position: 1000 }, { id: 'b', position: 2000 }, { id: 'c', position: 3000 }]

  it('grava só a posição do item movido quando há folga', () => {
    expect(planMove(list, 1)).toEqual({ position: 1500, renumber: [] })
    expect(planMove(list, 0)).toEqual({ position: 500, renumber: [] })
    expect(planMove(list, 3)).toEqual({ position: 4000, renumber: [] })
    expect(planMove([], 0)).toEqual({ position: 1000, renumber: [] })
  })

  it('renumera a coluna quando as posições estão coladas (dados antigos, todos em 1000)', () => {
    const stuck = [{ id: 'a', position: 1000 }, { id: 'b', position: 1000 }, { id: 'c', position: 1000 }]
    const plan = planMove(stuck, 1)
    expect(plan.position).toBe(2000)
    expect(plan.renumber).toEqual([{ id: 'b', position: 3000 }, { id: 'c', position: 4000 }])
  })

  it('mantém a ordem pedida depois de aplicar o plano', () => {
    const stuck = [{ id: 'a', position: 1 }, { id: 'b', position: 2 }]
    const plan = planMove(stuck, 1)
    const result = [...stuck.map((item) => ({ ...item, position: plan.renumber.find((r) => r.id === item.id)?.position ?? item.position })), { id: 'x', position: plan.position }].sort((a, b) => a.position - b.position)
    expect(result.map((item) => item.id)).toEqual(['a', 'x', 'b'])
  })
})

describe('resumo e filtros', () => {
  const done = { id: 't', title: 't', done: true, elapsedSeconds: 0, timerStartedAt: null }

  it('considera concluída a demanda na última coluna ou com todas as tarefas feitas', () => {
    expect(isDone(card({ column: 'done' }), columns)).toBe(true)
    expect(isDone(card({ tasks: [done] }), columns)).toBe(true)
    expect(isDone(card({ tasks: [done, { ...done, id: 'u', done: false }] }), columns)).toBe(false)
    expect(isDone(card({}), columns)).toBe(false)
  })

  it('separa atrasadas, de hoje e da semana, ignorando as concluídas', () => {
    const cards = [
      card({ id: '1', due: '2026-11-10' }),
      card({ id: '2', due: '2026-11-12' }),
      card({ id: '3', due: '2026-11-15' }),
      card({ id: '4', due: '2026-11-01', column: 'done' }),
      card({ id: '5' }),
    ]
    const summary = summarize(cards, columns, now)
    expect(summary.late.map((item) => item.id)).toEqual(['1'])
    expect(summary.today.map((item) => item.id)).toEqual(['2'])
    expect(summary.week.map((item) => item.id)).toEqual(['3'])
    expect(summary).toMatchObject({ total: 5, done: 1, open: 4, undated: 1, progress: 20 })
    expect(briefing(summary, now).mood).toBe('worried')
    expect(briefing(summarize([], columns, now), now).mood).toBe('sleepy')
    expect(briefing(summarize([cards[3]], columns, now), now).mood).toBe('party')
  })

  it('filtra por texto sem depender de acentos e por situação', () => {
    const item = card({ title: 'Seminário de Álgebra', discipline: 'Matemática' })
    expect(matchesFilters(item, { ...emptyFilters, search: 'seminario algebra' }, columns)).toBe(false)
    expect(matchesFilters(item, { ...emptyFilters, search: 'algebra' }, columns)).toBe(true)
    expect(matchesFilters(item, { ...emptyFilters, status: 'done' }, columns)).toBe(false)
    expect(matchesFilters(item, { ...emptyFilters, status: 'open', priority: 'media' }, columns)).toBe(true)
  })
})

describe('mensagens de erro', () => {
  it('traduz erros de autenticação e nunca mostra a mensagem crua', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
    expect(friendlyError({ message: 'relation "cards" violates row-level security policy' }, 'Não foi possível salvar.')).toBe('Não foi possível salvar.')
  })
})

describe('plano de foco', () => {
  const task = (id: string, done: boolean) => ({ id, title: `Passo ${id}`, done, elapsedSeconds: 600, timerStartedAt: null })
  const three: Column[] = [columns[0], { id: 'doing', title: 'Em andamento', color: '#000', position: 1500 }, columns[1]]

  it('ordena: atrasadas, depois entregas em até 7 dias, depois o que já começou', () => {
    const plan = buildPlan([
      card({ id: 'semana', due: '2026-11-16' }),
      card({ id: 'atrasada', due: '2026-11-09' }),
      card({ id: 'hoje', due: '2026-11-12', priority: 'alta' }),
      card({ id: 'longe', due: '2026-12-20' }),
      card({ id: 'andando', column: 'doing' }),
      card({ id: 'pronta', due: '2026-11-13', column: 'done' }),
    ], three, now)
    expect(plan.overdue.map((item) => item.card.id)).toEqual(['atrasada'])
    expect(plan.upcoming.map((item) => item.card.id)).toEqual(['hoje', 'semana'])
    expect(plan.advance.map((item) => item.card.id)).toEqual(['andando'])
    expect(plan.total).toBe(4)
    expect(plan.weekend).toBe(false) // quinta-feira
    expect(buildPlan([], three, new Date(2026, 10, 14)).weekend).toBe(true) // sábado
  })

  it('aponta o próximo passo e soma o tempo já gasto', () => {
    const [item] = buildPlan([card({ due: '2026-11-13', tasks: [task('a', true), task('b', false), task('c', false)] })], three, now).upcoming
    expect(item.nextTask?.id).toBe('b')
    expect(item.spentSeconds).toBe(1800)
  })
})

describe('segurança', () => {
  it('só aceita cor hexadecimal para as colunas (o valor vai para um style)', () => {
    expect(safeColor('#f5a524')).toBe('#f5a524')
    expect(safeColor('url(https://exemplo.com/rastreio.png)')).toBe('#a8a29e')
    expect(safeColor('red; background-image: url(x)')).toBe('#a8a29e')
    expect(safeColor(null)).toBe('#a8a29e')
  })
})
