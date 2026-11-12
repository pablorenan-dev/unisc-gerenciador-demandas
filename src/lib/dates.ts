/** Utilitários de data. Datas de entrega são dias de calendário (AAAA-MM-DD), sem fuso. */

const DAY = 86400000

export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Interpreta AAAA-MM-DD como meia-noite local, evitando o deslocamento de fuso do `new Date(string)`. */
export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Dias inteiros de hoje até a data. Negativo = atrasado. `null` = sem data. */
export function daysUntil(value: string, now: Date = new Date()): number | null {
  const date = parseISODate(value)
  if (!date) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((date.getTime() - today.getTime()) / DAY)
}

export function formatShort(value: string): string {
  const date = parseISODate(value)
  if (!date) return ''
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export function formatRange(start: string, end: string): string {
  if (!end) return ''
  if (!start || start === end) return formatShort(end)
  return `${formatShort(start)} – ${formatShort(end)}`
}

/** Texto humano para o prazo: "Hoje", "Amanhã", "Atrasada há 3 dias", "Em 5 dias". */
export function dueLabel(value: string, now: Date = new Date()): string {
  const days = daysUntil(value, now)
  if (days === null) return 'Sem data'
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  if (days === -1) return 'Atrasada desde ontem'
  if (days < 0) return `Atrasada há ${-days} dias`
  if (days <= 7) return `Em ${days} dias`
  return formatShort(value)
}

export type DueTone = 'none' | 'late' | 'today' | 'soon' | 'later'

export function dueTone(value: string, now: Date = new Date()): DueTone {
  const days = daysUntil(value, now)
  if (days === null) return 'none'
  if (days < 0) return 'late'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  return 'later'
}

export function isWeekend(now: Date = new Date()): boolean {
  return now.getDay() === 0 || now.getDay() === 6
}

export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + amount)
  return next
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `${hours > 0 ? `${hours}h ` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
