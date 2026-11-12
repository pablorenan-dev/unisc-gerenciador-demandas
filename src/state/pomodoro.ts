import { useSyncExternalStore } from 'react'
import { advance, formatClock, initialState, isRunning, parseState, pause, resume, secondsLeft, skipBreak, startFocus, stop, type Credit, type PomodoroEvent, type PomodoroLink, type PomodoroSettings, type PomodoroState } from '../lib/pomodoro'
import { meow } from '../mascot/voice'
import { catSay } from './feedback'

/**
 * Pomodoro global: continua contando ao trocar de tela, sobrevive a recarregar a página
 * (o fim da fase é um horário, não um contador) e fica sincronizado entre abas.
 */
const KEY = 'ugd-pomodoro'
const CREDITS_KEY = 'ugd-pomodoro-creditos'

const listeners = new Set<() => void>()
let state: PomodoroState = load()
let timer: number | null = null
let baseTitle = typeof document !== 'undefined' ? document.title : ''

function load(): PomodoroState {
  try { return parseState(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'), Date.now()) } catch { return initialState(Date.now()) }
}

function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* sem armazenamento: vale só nesta aba */ }
}

function emit() {
  listeners.forEach((listener) => listener())
  updateTitle()
}

function set(next: PomodoroState) {
  state = next
  save()
  ensureTicking()
  emit()
}

/* ------------------------------ Créditos ------------------------------ */

/** Tempo de foco a lançar na tarefa vinculada; aplicado pela tela do quadro que contém o card. */
export function pendingCredits(): Credit[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(CREDITS_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((item): item is Credit => Boolean(item) && typeof item.id === 'string' && typeof item.cardId === 'string' && typeof item.seconds === 'number' && item.seconds > 0) : []
  } catch { return [] }
}

export function setPendingCredits(list: Credit[]) {
  try { window.localStorage.setItem(CREDITS_KEY, JSON.stringify(list.slice(-50))) } catch { /* ignora */ }
  emit()
}

function addCredit(credit: Credit | null) {
  if (credit) setPendingCredits([...pendingCredits(), credit])
}

/* ------------------------------ Avisos ------------------------------ */

function notify(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
    new Notification(title, { body, icon: '/favicon.png', tag: 'ugd-pomodoro' })
  } catch { /* sem notificação do sistema */ }
}

function announce(event: PomodoroEvent, quiet: boolean) {
  if (event === 'focus-end') {
    const text = state.long ? 'Pausa longa! Vai lá, deita no sofá igual eu.' : 'Pausa! Estica as pernas e bebe uma água.'
    if (!quiet) { meow('trill'); catSay(text, 'party', 8000) }
    notify('Foco concluído 🐱', text)
  } else {
    if (!quiet) { meow('kitten'); catSay('Acabou a pausa. Bora mais um?', 'curious', 8000) }
    notify('Fim da pausa', 'Bora mais um pomodoro?')
  }
}

/** Pede permissão de notificação no primeiro foco (precisa ser em resposta a um clique). */
function askPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
  } catch { /* ignora */ }
}

/* ------------------------------ Relógio ------------------------------ */

function tick() {
  const now = Date.now()
  // Outra aba pode ter concluído a fase: confere o estado salvo antes de avançar.
  const stored = load()
  if (stored.id !== state.id) { state = stored; emit(); ensureTicking(); return }
  const late = state.endsAt !== null && now - state.endsAt > 60_000
  const result = advance(state, now)
  if (result.event) {
    addCredit(result.credit)
    set(result.state)
    announce(result.event, late)
  } else {
    emit()
  }
}

function ensureTicking() {
  if (typeof window === 'undefined') return
  if (isRunning(state) && timer === null) timer = window.setInterval(tick, 1000)
  if (!isRunning(state) && timer !== null) { window.clearInterval(timer); timer = null }
}

function updateTitle() {
  if (typeof document === 'undefined') return
  if (!isRunning(state) && state.phase === 'idle') { if (baseTitle) document.title = baseTitle; return }
  const clock = formatClock(secondsLeft(state, Date.now()))
  const label = state.phase === 'focus' ? 'Foco' : 'Pausa'
  document.title = `${clock} · ${label}${state.endsAt === null ? ' (pausado)' : ''} — UGD`
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) { state = load(); ensureTicking(); emit() }
    if (event.key === CREDITS_KEY) emit()
  })
  ensureTicking()
  // Fase que terminou com o app fechado é concluída ao abrir (sem miar fora de hora).
  if (isRunning(state)) window.setTimeout(tick, 0)
}

/* ------------------------------ Ações ------------------------------ */

export const pomodoro = {
  start(link?: PomodoroLink | null) {
    askPermission()
    const now = Date.now()
    let current = state
    if (current.phase === 'focus') { const stopped = stop(current, now); addCredit(stopped.credit); current = stopped.state }
    set(startFocus(current, now, link === undefined ? current.link : link))
    catSay(link?.taskTitle ? `Foco em "${link.taskTitle}". Vou tirar um cochilo enquanto isso.` : 'Foco ligado. Vou tirar um cochilo enquanto isso.', 'sleepy', 5000)
  },
  pause() { set(pause(state, Date.now())) },
  resume() { set(resume(state, Date.now())) },
  stop() {
    const result = stop(state, Date.now())
    addCredit(result.credit)
    set(result.state)
  },
  skipBreak() { set(skipBreak(state, Date.now())) },
  unlink() { set({ ...state, link: null }) },
  /** Escolhe em que focar sem iniciar o relógio (não troca durante um foco em andamento). */
  setLink(link: PomodoroLink | null) { if (state.phase !== 'focus') set({ ...state, link }) },
  setSettings(settings: PomodoroSettings) {
    // Trocar a duração não mexe na fase em andamento; vale a partir da próxima.
    set({ ...state, settings })
  },
}

export function getPomodoro(): PomodoroState {
  return state
}

export function usePomodoro(): PomodoroState {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => state)
}

/** Assina também os créditos pendentes (para a tela do quadro aplicá-los). */
export function subscribePomodoro(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Só para testes. */
export function resetPomodoro(next: PomodoroState = initialState(Date.now())) {
  if (timer !== null) { window.clearInterval(timer); timer = null }
  try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(CREDITS_KEY) } catch { /* ignora */ }
  state = next
  baseTitle = document.title
  emit()
}
