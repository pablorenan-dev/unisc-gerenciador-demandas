import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { idlePhrases } from '../lib/insights'
import { catSay, dismissToast, useFeedback, type Mood } from '../state/feedback'
import { usePrefs } from '../state/prefs'
import { Chiquinho } from './Chiquinho'
import { meow } from './voice'

const petLines = ['Miau!', 'Prrrr…', 'De novo.', 'Aí sim.', 'Não para.', 'PRRRRRRR', 'Tá, já deu. (não deu)']

/**
 * O Chiquinho no cantinho da tela. Reage aos eventos do app (via `catSay`),
 * solta uma frase de vez em quando e mia quando recebe carinho.
 */
export function Companion({ fallbackMood = 'idle' }: { fallbackMood?: Mood }) {
  const { speech } = useFeedback()
  const prefs = usePrefs()
  const [pets, setPets] = useState(0)
  const [petting, setPetting] = useState(false)
  const cooldown = useRef<number | null>(null)
  const speaking = useRef(false)
  useEffect(() => { speaking.current = Boolean(speech) }, [speech])

  // Conversa fiada ocasional, só quando não há nada mais importante sendo dito.
  useEffect(() => {
    if (!prefs.chatter) return
    // A cada 15s há 50% de chance de uma frase: em média, uma a cada 30 segundos.
    // Nunca repete a anterior nem interrompe um aviso que ainda está na tela.
    let last = ''
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || speaking.current || Math.random() > 0.5) return
      const options = idlePhrases.filter((phrase) => phrase !== last)
      last = options[Math.floor(Math.random() * options.length)]
      catSay(last, 'idle', 6000)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [prefs.chatter])

  // O "nível de carinho" esfria sozinho.
  useEffect(() => {
    if (pets === 0) return
    const timer = window.setTimeout(() => setPets((value) => Math.max(0, value - 1)), 1100)
    return () => window.clearTimeout(timer)
  }, [pets])

  function pet() {
    const next = Math.min(6, pets + 1)
    setPets(next)
    setPetting(true)
    if (cooldown.current) window.clearTimeout(cooldown.current)
    cooldown.current = window.setTimeout(() => setPetting(false), 700)
    meow(next >= 5 ? 'trill' : undefined)
    catSay(petLines[next] ?? petLines[0], next >= 5 ? 'party' : 'happy', 2200)
  }

  const mood: Mood = speech?.mood ?? (petting ? 'happy' : fallbackMood)

  return (
    <div className={`companion ${petting ? 'companion--petting' : ''}`} style={{ '--pets': pets } as React.CSSProperties}>
      <div className={`bubble ${speech ? 'bubble--visible' : ''}`} role="status" aria-live="polite">{speech?.text}</div>
      <button type="button" className="companion__button" onClick={pet} aria-label="Fazer carinho no Chiquinho">
        <Chiquinho mood={mood} size={76} alt="Chiquinho, o gato" />
      </button>
    </div>
  )
}

/** Avisos do app. Cada aviso vem com a carinha do Chiquinho no humor correspondente. */
export function Toasts() {
  const { toasts } = useFeedback()
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
          <Chiquinho mood={item.mood} size={36} />
          <span className="toast__text">{item.text}</span>
          {item.action && <button type="button" className="toast__action" onClick={() => { item.action?.run(); dismissToast(item.id) }}>{item.action.label}</button>}
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => dismissToast(item.id)} aria-label="Dispensar aviso"><X size={16} aria-hidden /></button>
        </div>
      ))}
    </div>
  )
}
