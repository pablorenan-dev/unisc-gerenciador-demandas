import { useSyncExternalStore } from 'react'

/** Humor do Chiquinho: define adereço, animação e tom das falas. */
export type Mood = 'idle' | 'happy' | 'party' | 'sleepy' | 'worried' | 'oops' | 'thinking' | 'curious'

export type Toast = {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
  mood: Mood
  action?: { label: string; run: () => void }
}

export type Speech = { id: number; text: string; mood: Mood }

type State = { toasts: Toast[]; speech: Speech | null }

let state: State = { toasts: [], speech: null }
let sequence = 0
const listeners = new Set<() => void>()
const timers = new Map<number, number>()
let speechTimer: number | null = null

function update(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

export function dismissToast(id: number) {
  const timer = timers.get(id)
  if (timer) window.clearTimeout(timer)
  timers.delete(id)
  update({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) })
}

function push(kind: Toast['kind'], text: string, options: { mood?: Mood; action?: Toast['action']; duration?: number } = {}) {
  sequence += 1
  const id = sequence
  const mood = options.mood ?? (kind === 'error' ? 'oops' : kind === 'success' ? 'happy' : 'curious')
  update({ ...state, toasts: [...state.toasts.slice(-2), { id, kind, text, mood, action: options.action }] })
  // Cada aviso tem o próprio timer; erros ficam mais tempo na tela.
  timers.set(id, window.setTimeout(() => dismissToast(id), options.duration ?? (kind === 'error' ? 7000 : options.action ? 6000 : 3200)))
  return id
}

export const toast = {
  success: (text: string, options?: { mood?: Mood; action?: Toast['action']; duration?: number }) => push('success', text, options),
  error: (text: string, options?: { mood?: Mood; action?: Toast['action'] }) => push('error', text, options),
  info: (text: string, options?: { mood?: Mood; action?: Toast['action']; duration?: number }) => push('info', text, options),
}

/** Faz o Chiquinho reagir no cantinho da tela (balão + adereço). */
export function catSay(text: string, mood: Mood = 'idle', duration = 5200) {
  sequence += 1
  if (speechTimer) window.clearTimeout(speechTimer)
  update({ ...state, speech: { id: sequence, text, mood } })
  speechTimer = window.setTimeout(() => update({ ...state, speech: null }), duration)
}

export function useFeedback(): State {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => state)
}

/** Só para testes. */
export function resetFeedback() {
  timers.forEach((timer) => window.clearTimeout(timer))
  timers.clear()
  if (speechTimer) window.clearTimeout(speechTimer)
  update({ toasts: [], speech: null })
}
