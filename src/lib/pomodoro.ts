/**
 * Regras do pomodoro, sem efeitos colaterais (o relógio é passado como parâmetro).
 * Fluxo: foco → pausa (curta, ou longa a cada N focos) → pronto para o próximo foco.
 */

export type Phase = 'idle' | 'focus' | 'break'

export type PomodoroLink = { boardId: string; cardId: string; cardTitle: string; taskId: string | null; taskTitle: string | null }

export type PomodoroSettings = { focus: number; shortBreak: number; longBreak: number; longEvery: number }

export type PomodoroState = {
  /** Muda a cada fase: evita que duas abas abertas concluam a mesma fase duas vezes. */
  id: string
  phase: Phase
  /** Pausa longa? (só vale na fase 'break'). */
  long: boolean
  /** Fim da fase em ms; `null` quando pausado ou parado. */
  endsAt: number | null
  /** Segundos restantes (quando pausado) ou total da fase (ao iniciar). */
  remaining: number
  /** Duração total da fase atual, em segundos. */
  total: number
  /** Focos concluídos desde a última pausa longa. */
  cycle: number
  link: PomodoroLink | null
  settings: PomodoroSettings
  today: { date: string; count: number; seconds: number }
}

/** Tempo de foco a creditar na tarefa vinculada. */
export type Credit = { id: string; cardId: string; taskId: string | null; seconds: number }

export type PomodoroEvent = 'focus-end' | 'break-end'

export const presets: { label: string; settings: PomodoroSettings }[] = [
  { label: '25 / 5', settings: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 } },
  { label: '50 / 10', settings: { focus: 50, shortBreak: 10, longBreak: 20, longEvery: 3 } },
  { label: '15 / 3', settings: { focus: 15, shortBreak: 3, longBreak: 10, longEvery: 4 } },
]

const localDate = (now: number) => {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

let sequence = 0
const nextId = (now: number) => `${now.toString(36)}-${(sequence += 1).toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function initialState(now: number): PomodoroState {
  return { id: nextId(now), phase: 'idle', long: false, endsAt: null, remaining: 0, total: 0, cycle: 0, link: null, settings: presets[0].settings, today: { date: localDate(now), count: 0, seconds: 0 } }
}

/** Zera o contador do dia quando vira a data. */
const rollDay = (state: PomodoroState, now: number): PomodoroState =>
  state.today.date === localDate(now) ? state : { ...state, today: { date: localDate(now), count: 0, seconds: 0 } }

export const secondsLeft = (state: PomodoroState, now: number) =>
  state.endsAt === null ? state.remaining : Math.max(0, Math.min(state.total, Math.ceil((state.endsAt - now) / 1000)))

export const isRunning = (state: PomodoroState) => state.phase !== 'idle' && state.endsAt !== null

/** Segundos de foco já cumpridos na fase atual. */
const focused = (state: PomodoroState, now: number) => (state.phase === 'focus' ? Math.max(0, state.total - secondsLeft(state, now)) : 0)

const creditFor = (state: PomodoroState, seconds: number, now: number): Credit | null =>
  state.link && seconds >= 60 ? { id: nextId(now), cardId: state.link.cardId, taskId: state.link.taskId, seconds } : null

export function startFocus(state: PomodoroState, now: number, link: PomodoroLink | null = state.link): PomodoroState {
  const total = state.settings.focus * 60
  return { ...rollDay(state, now), id: nextId(now), phase: 'focus', long: false, endsAt: now + total * 1000, remaining: total, total, link }
}

export function startBreak(state: PomodoroState, now: number, long: boolean): PomodoroState {
  const total = (long ? state.settings.longBreak : state.settings.shortBreak) * 60
  return { ...state, id: nextId(now), phase: 'break', long, endsAt: now + total * 1000, remaining: total, total }
}

export function pause(state: PomodoroState, now: number): PomodoroState {
  if (!isRunning(state)) return state
  return { ...state, endsAt: null, remaining: secondsLeft(state, now) }
}

export function resume(state: PomodoroState, now: number): PomodoroState {
  if (state.phase === 'idle' || state.endsAt !== null) return state
  return { ...state, endsAt: now + state.remaining * 1000 }
}

/** Para tudo. Foco interrompido ainda credita o tempo cumprido (a partir de 1 minuto), mas não conta como pomodoro. */
export function stop(state: PomodoroState, now: number): { state: PomodoroState; credit: Credit | null } {
  const seconds = focused(state, now)
  const credit = creditFor(state, seconds, now)
  const base = rollDay(state, now)
  return {
    state: { ...base, id: nextId(now), phase: 'idle', long: false, endsAt: null, remaining: 0, total: 0, today: { ...base.today, seconds: base.today.seconds + (credit ? seconds : 0) } },
    credit,
  }
}

/** Avança quando o tempo acabou: foco → pausa; pausa → pronto para o próximo foco. */
export function advance(state: PomodoroState, now: number): { state: PomodoroState; event: PomodoroEvent | null; credit: Credit | null } {
  if (!isRunning(state) || secondsLeft(state, now) > 0) return { state, event: null, credit: null }
  if (state.phase === 'focus') {
    const credit = creditFor(state, state.total, now)
    const cycle = state.cycle + 1
    const long = cycle >= state.settings.longEvery
    const base = rollDay(state, now)
    const counted = { ...base, cycle: long ? 0 : cycle, today: { ...base.today, count: base.today.count + 1, seconds: base.today.seconds + state.total } }
    return { state: startBreak(counted, now, long), event: 'focus-end', credit }
  }
  return { state: { ...state, id: nextId(now), phase: 'idle', long: false, endsAt: null, remaining: 0, total: 0 }, event: 'break-end', credit: null }
}

/** Pula a pausa e já começa o próximo foco. */
export const skipBreak = (state: PomodoroState, now: number) => (state.phase === 'break' ? startFocus(state, now) : state)

/** Humor do Chiquinho conforme a fase: dorme no foco, comemora na pausa. */
export const moodFor = (state: PomodoroState): 'sleepy' | 'happy' | 'idle' => (state.phase === 'focus' ? 'sleepy' : state.phase === 'break' ? 'happy' : 'idle')

export const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

/** Lê o estado salvo, descartando qualquer coisa malformada. */
export function parseState(raw: unknown, now: number): PomodoroState {
  const base = initialState(now)
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Partial<PomodoroState>
  const number = (input: unknown, fallback: number) => (typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : fallback)
  const settings = value.settings && typeof value.settings === 'object' ? value.settings : base.settings
  const minutes = (input: unknown, fallback: number) => Math.min(120, Math.max(1, Math.round(number(input, fallback))))
  const link = value.link && typeof value.link === 'object' && typeof value.link.cardId === 'string' ? value.link : null
  const phase: Phase = value.phase === 'focus' || value.phase === 'break' ? value.phase : 'idle'
  const today = value.today && typeof value.today === 'object' && typeof value.today.date === 'string' ? value.today : base.today
  return rollDay({
    id: typeof value.id === 'string' ? value.id : base.id,
    phase,
    long: Boolean(value.long),
    endsAt: phase === 'idle' || value.endsAt === null || value.endsAt === undefined ? null : number(value.endsAt, now),
    remaining: number(value.remaining, 0),
    total: number(value.total, 0),
    cycle: number(value.cycle, 0),
    link: link ? { boardId: String(link.boardId), cardId: link.cardId, cardTitle: String(link.cardTitle ?? ''), taskId: typeof link.taskId === 'string' ? link.taskId : null, taskTitle: typeof link.taskTitle === 'string' ? link.taskTitle : null } : null,
    settings: { focus: minutes(settings.focus, 25), shortBreak: minutes(settings.shortBreak, 5), longBreak: minutes(settings.longBreak, 15), longEvery: Math.min(8, Math.max(2, Math.round(number(settings.longEvery, 4)))) },
    today: { date: today.date, count: number(today.count, 0), seconds: number(today.seconds, 0) },
  }, now)
}
