/**
 * Faz os Chiquinhos em miniatura olharem para o ponteiro e piscarem de vez em quando.
 * Um único par de ouvintes atende todos os gatinhos da tela (pode haver dezenas no quadro):
 * nada de animação contínua nem de estado no React, só duas variáveis CSS por gato.
 */
const SELECTOR = 'svg.mini-chico--idle, svg.mini-chico--done'
/** Distância (px) a partir da qual o olhar chega ao canto do olho. */
const REACH = 140
const BLINK_EVERY = 2600
const BLINK_MS = 150

let watchers = 0
let frame = 0
let blinkTimer = 0
let pointer: { x: number; y: number } | null = null

function look() {
  frame = 0
  const cats = Array.from(document.querySelectorAll<SVGSVGElement>(SELECTOR))
  if (!pointer) {
    cats.forEach((cat) => { cat.style.removeProperty('--look-x'); cat.style.removeProperty('--look-y') })
    return
  }
  const { x, y } = pointer
  // Primeiro lê todas as posições, depois escreve: evita recalcular o layout a cada gato.
  const rects = cats.map((cat) => cat.getBoundingClientRect())
  cats.forEach((cat, index) => {
    const rect = rects[index]
    const dx = x - (rect.left + rect.width / 2)
    const dy = y - (rect.top + rect.height / 2)
    const distance = Math.hypot(dx, dy) || 1
    const strength = Math.min(1, distance / REACH)
    cat.style.setProperty('--look-x', ((dx / distance) * strength).toFixed(2))
    cat.style.setProperty('--look-y', ((dy / distance) * strength).toFixed(2))
  })
}

function schedule() {
  if (!frame) frame = window.requestAnimationFrame(look)
}

function onMove(event: PointerEvent) {
  pointer = { x: event.clientX, y: event.clientY }
  schedule()
}

/** No toque não existe ponteiro parado: ao soltar o dedo, o olhar volta para a frente. */
function onRelease(event: PointerEvent) {
  if (event.pointerType === 'mouse') return
  pointer = null
  schedule()
}

function blink() {
  if (document.visibilityState !== 'visible') return
  const cats = document.querySelectorAll<SVGSVGElement>(SELECTOR)
  if (!cats.length) return
  // Um ou dois por vez, sorteados: o quadro parece vivo sem todo mundo piscar junto.
  for (let count = cats.length > 6 ? 2 : 1; count > 0; count -= 1) {
    const cat = cats[Math.floor(Math.random() * cats.length)]
    cat.setAttribute('data-blink', '')
    window.setTimeout(() => cat.removeAttribute('data-blink'), BLINK_MS)
  }
}

/** Liga o olhar enquanto houver pelo menos um gatinho na tela. Devolve a função que desliga. */
export function watchCats(): () => void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return () => {}
  watchers += 1
  if (watchers === 1) {
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onRelease, { passive: true })
    window.addEventListener('pointercancel', onRelease, { passive: true })
    blinkTimer = window.setInterval(blink, BLINK_EVERY)
  }
  return () => {
    watchers -= 1
    if (watchers > 0) return
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onRelease)
    window.removeEventListener('pointercancel', onRelease)
    window.clearInterval(blinkTimer)
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    pointer = null
  }
}
