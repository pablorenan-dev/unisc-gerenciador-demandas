import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type Prefs = { theme: Theme; sound: boolean; chatter: boolean }

const KEY = 'ugd-prefs'
const listeners = new Set<() => void>()

function read(): Prefs {
  const fallback: Prefs = { theme: 'system', sound: true, chatter: true }
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored) return { ...fallback, ...(JSON.parse(stored) as Partial<Prefs>) }
    // Migração da preferência antiga (`ugd-dark-mode`).
    const legacy = window.localStorage.getItem('ugd-dark-mode')
    if (legacy !== null) return { ...fallback, theme: legacy === 'false' ? 'light' : 'dark' }
  } catch { /* armazenamento indisponível: usa o padrão */ }
  return fallback
}

let current = read()

export function getPrefs(): Prefs {
  return current
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  try { window.localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* ignora */ }
  applyTheme()
  listeners.forEach((listener) => listener())
}

export function resolvedTheme(): 'light' | 'dark' {
  if (current.theme !== 'system') return current.theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, getPrefs)
}

applyTheme()
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme)
