import { useEffect, useSyncExternalStore } from 'react'
import type { MiniState } from '../mascot/MiniChico'

/** Duração da comemoração (o brilho verde e o Chiquinho feliz), em ms. */
export const CELEBRATION_MS = 1700
/** Tempo que o estado sobrevive sem ninguém na tela: cobre a remontagem do arraste, e só. */
const FORGET_MS = 3000

/**
 * Último estado conhecido de cada demanda/tarefa, por id. Fica fora do React de propósito:
 * ao arrastar um card para outra coluna ele é remontado, e é justamente aí que precisa comemorar.
 * `until` é o horário em que a comemoração termina (0 = não está comemorando).
 */
const seen = new Map<string, { done: boolean; until: number }>()
/** Quantos componentes estão mostrando cada id agora. */
const mounted = new Map<string, number>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function remember(id: string, done: boolean, until: number) {
  const changed = (seen.get(id)?.until ?? 0) !== until
  seen.set(id, { done, until })
  if (changed) listeners.forEach((listener) => listener())
}

/**
 * Verdadeiro por alguns instantes logo depois que o item passa de "não concluído" para "concluído".
 * A primeira vez que um id aparece (carregar o quadro, duplicar) não conta como conclusão.
 */
export function useCelebration(id: string, done: boolean): boolean {
  const until = useSyncExternalStore(subscribe, () => seen.get(id)?.until ?? 0)

  // Saiu da tela de vez (trocou de visão, fechou o diálogo)? Esquece, para não comemorar
  // com atraso algo que foi concluído enquanto ninguém estava olhando.
  useEffect(() => {
    mounted.set(id, (mounted.get(id) ?? 0) + 1)
    return () => {
      const left = (mounted.get(id) ?? 1) - 1
      if (left > 0) { mounted.set(id, left); return }
      mounted.delete(id)
      window.setTimeout(() => { if (!mounted.has(id)) seen.delete(id) }, FORGET_MS)
    }
  }, [id])

  useEffect(() => {
    const previous = seen.get(id)
    const now = Date.now()
    const target = !done ? 0 : previous && !previous.done ? now + CELEBRATION_MS : previous?.until ?? 0
    const next = target > now ? target : 0
    remember(id, done, next)
    if (!next) return
    const timer = window.setTimeout(() => remember(id, done, 0), next - now)
    return () => window.clearTimeout(timer)
  }, [id, done])

  return until > 0
}

/** O que o Chiquinho em miniatura mostra, por ordem de prioridade. */
export function miniState(flags: { celebrating: boolean; done: boolean; working: boolean }): MiniState {
  return flags.celebrating ? 'happy' : flags.done ? 'done' : flags.working ? 'working' : 'idle'
}

/** Só para testes. */
export function resetCelebrations() {
  seen.clear()
  mounted.clear()
}
