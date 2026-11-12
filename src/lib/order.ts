/**
 * Ordenação por posição com folgas (1000, 2000, ...).
 * Mover um item grava só a posição dele (ponto médio entre os vizinhos).
 * Quando não há folga, a lista de destino inteira é renumerada.
 */

export const STEP = 1000

export type Positioned = { id: string; position: number }

export type MovePlan = {
  /** Nova posição do item movido. */
  position: number
  /** Preenchido só quando foi preciso renumerar os irmãos (não inclui o item movido). */
  renumber: Positioned[]
}

/**
 * @param siblings itens do destino, já ordenados e SEM o item movido
 * @param index índice de inserção (0 = primeiro, siblings.length = último)
 */
export function planMove(siblings: Positioned[], index: number): MovePlan {
  const at = Math.max(0, Math.min(index, siblings.length))
  const previous = siblings[at - 1]?.position
  const next = siblings[at]?.position

  if (previous === undefined && next === undefined) return { position: STEP, renumber: [] }
  if (next === undefined) return { position: (previous as number) + STEP, renumber: [] }

  const floor = previous ?? 0
  const middle = Math.floor((floor + next) / 2)
  if (middle > floor && middle < next) return { position: middle, renumber: [] }

  const renumber: Positioned[] = []
  siblings.forEach((item, itemIndex) => {
    const slot = itemIndex < at ? itemIndex : itemIndex + 1
    const position = (slot + 1) * STEP
    if (position !== item.position) renumber.push({ id: item.id, position })
  })
  return { position: (at + 1) * STEP, renumber }
}

export function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position
}

export function nextPosition(items: { position: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + STEP
}
