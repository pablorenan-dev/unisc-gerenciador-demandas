import { useEffect, useState, type CSSProperties } from 'react'
import { Coffee, Pause, Play, SkipForward, Square, Timer, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatClock, isRunning, moodFor, presets, secondsLeft, type PomodoroLink, type PomodoroSettings, type PomodoroState } from '../../lib/pomodoro'
import { Chiquinho } from '../../mascot/Chiquinho'
import { pomodoro, usePomodoro } from '../../state/pomodoro'

/** Re-renderiza a cada segundo enquanto o relógio corre. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  // Parado ou pausado, o tempo restante não depende do relógio.
  return now
}

const label = (state: PomodoroState) => (state.phase === 'focus' ? 'Foco' : state.phase === 'break' ? (state.long ? 'Pausa longa' : 'Pausa') : 'Pronto')

const formatMinutes = (seconds: number) => {
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`
}

const clampMinutes = (value: number) => Math.min(120, Math.max(1, Math.round(value)))

/** Duração escolhida à mão. A pausa longa acompanha a curta (3x, entre 10 e 30 min). */
function CustomDurations({ settings }: { settings: PomodoroSettings }) {
  // O texto digitado fica local: dá para apagar o campo inteiro antes de escrever o novo número.
  const [focus, setFocus] = useState(String(settings.focus))
  const [rest, setRest] = useState(String(settings.shortBreak))
  const apply = (nextFocus: string, nextRest: string) => {
    const focusMinutes = Number(nextFocus)
    const restMinutes = Number(nextRest)
    if (!nextFocus.trim() || !nextRest.trim() || !Number.isFinite(focusMinutes) || !Number.isFinite(restMinutes) || focusMinutes < 1 || restMinutes < 1) return
    const shortBreak = clampMinutes(restMinutes)
    pomodoro.setSettings({ ...settings, focus: clampMinutes(focusMinutes), shortBreak, longBreak: Math.min(30, Math.max(10, shortBreak * 3)) })
  }
  return (
    <div className="pomodoro__custom">
      <label><span>Foco</span><input className="input" type="number" inputMode="numeric" min={1} max={120} value={focus} aria-label="Minutos de foco" onChange={(event) => { setFocus(event.target.value); apply(event.target.value, rest) }} /><span>min</span></label>
      <label><span>Pausa</span><input className="input" type="number" inputMode="numeric" min={1} max={120} value={rest} aria-label="Minutos de pausa" onChange={(event) => { setRest(event.target.value); apply(focus, event.target.value) }} /><span>min</span></label>
    </div>
  )
}

/** Painel do pomodoro (visão Foco). */
export function PomodoroPanel({ candidates }: { candidates: PomodoroLink[] }) {
  const state = usePomodoro()
  const now = useNow(isRunning(state))
  const left = state.phase === 'idle' ? state.settings.focus * 60 : secondsLeft(state, now)
  const total = state.phase === 'idle' ? state.settings.focus * 60 : state.total
  const progress = total ? 1 - left / total : 0
  const paused = state.phase !== 'idle' && state.endsAt === null
  const currentPreset = presets.find((preset) => preset.settings.focus === state.settings.focus && preset.settings.shortBreak === state.settings.shortBreak)
  const linkKey = (link: PomodoroLink | null) => (link ? `${link.cardId}:${link.taskId ?? ''}` : '')
  const [customOpen, setCustomOpen] = useState(false)
  const custom = customOpen || !currentPreset
  const { focus, shortBreak, longBreak, longEvery } = state.settings
  // Bolinhas até a pausa longa: focos já feitos neste ciclo (todas cheias durante a pausa longa).
  const cycleDone = state.phase === 'break' && state.long ? longEvery : Math.min(state.cycle, longEvery)
  const heading = state.phase === 'focus' ? 'Foco total. O Chiquinho está dormindo.' : state.phase === 'break' ? (state.thenFocus ? 'Respira. Daqui a pouco tem foco.' : 'Pausa merecida.') : 'Bora focar?'
  const hint = state.phase === 'focus'
    ? 'Celular longe, uma coisa de cada vez.'
    : state.phase === 'break'
      ? (state.thenFocus ? `Quando a pausa acabar, o foco de ${focus} min começa sozinho.` : 'Levanta, bebe água, olha pela janela.')
      : `${focus} min de foco, ${shortBreak} de pausa. A cada ${longEvery} focos, uma pausa de ${longBreak}.`

  return (
    <section className={`pomodoro pomodoro--${state.phase}`} aria-label="Pomodoro">
      <div className="pomodoro__dial" style={{ '--progress': progress } as CSSProperties}>
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle className="pomodoro__track" cx="60" cy="60" r="54" />
          <circle className="pomodoro__bar" cx="60" cy="60" r="54" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - progress * 100} />
        </svg>
        <div className="pomodoro__center">
          <Chiquinho mood={moodFor(state)} size={64} />
          <strong className="pomodoro__clock" aria-live="off">{formatClock(left)}</strong>
          <span className="pomodoro__phase">{label(state)}{paused ? ' · pausado' : ''}</span>
          <span className="pomodoro__cycle" role="img" aria-label={`${cycleDone} de ${longEvery} focos até a pausa longa`}>
            {Array.from({ length: longEvery }, (_, index) => <i key={index} className={index < cycleDone ? 'is-on' : ''} />)}
          </span>
        </div>
      </div>

      <div className="pomodoro__side">
        <div>
          <p className="eyebrow">Pomodoro</p>
          <h2>{heading}</h2>
          <p className="pomodoro__hint">{hint}</p>
        </div>

        <label className="field">
          <span>Focar em</span>
          <select className="select" value={linkKey(state.link)} disabled={state.phase === 'focus'}
            onChange={(event) => pomodoro.setLink(candidates.find((item) => linkKey(item) === event.target.value) ?? null)}>
            <option value="">Nada específico</option>
            {state.link && !candidates.some((item) => linkKey(item) === linkKey(state.link)) && <option value={linkKey(state.link)}>{state.link.taskTitle ?? state.link.cardTitle}</option>}
            {candidates.map((item) => <option key={linkKey(item)} value={linkKey(item)}>{item.taskTitle ? `${item.taskTitle} — ${item.cardTitle}` : item.cardTitle}</option>)}
          </select>
        </label>

        <div className="pomodoro__controls">
          {state.phase === 'idle' && <button type="button" className="btn btn--primary" onClick={() => pomodoro.start()}><Play size={18} aria-hidden /> Iniciar foco</button>}
          {state.phase === 'idle' && <button type="button" className="btn" onClick={() => pomodoro.startBreak()} title={`${shortBreak} min de pausa e depois ${focus} min de foco`}><Coffee size={18} aria-hidden /> Começar pela pausa</button>}
          {state.phase !== 'idle' && (paused
            ? <button type="button" className="btn btn--primary" onClick={() => pomodoro.resume()}><Play size={18} aria-hidden /> Continuar</button>
            : <button type="button" className="btn btn--primary" onClick={() => pomodoro.pause()}><Pause size={18} aria-hidden /> Pausar</button>)}
          {state.phase === 'focus' && <button type="button" className="btn" onClick={() => pomodoro.startBreak()} title={`${shortBreak} min de pausa e depois o foco recomeça`}><Coffee size={18} aria-hidden /> Fazer uma pausa</button>}
          {state.phase === 'break' && <button type="button" className="btn" onClick={() => pomodoro.skipBreak()}><SkipForward size={18} aria-hidden /> Pular pausa</button>}
          {state.phase !== 'idle' && <button type="button" className="btn btn--ghost" onClick={() => pomodoro.stop()}><Square size={16} aria-hidden /> Parar</button>}
        </div>

        <div className="pomodoro__footer">
          <div className="segmented" role="radiogroup" aria-label="Duração">
            {presets.map((preset) => (
              <button key={preset.label} type="button" role="radio" aria-checked={!custom && currentPreset === preset} className={!custom && currentPreset === preset ? 'is-active' : ''} onClick={() => { setCustomOpen(false); pomodoro.setSettings(preset.settings) }}>{preset.label}</button>
            ))}
            <button type="button" role="radio" aria-checked={custom} className={custom ? 'is-active' : ''} onClick={() => setCustomOpen(true)}>Outro</button>
          </div>
          <span className="pomodoro__today">
            Hoje: <strong>{state.today.count}</strong> {state.today.count === 1 ? 'pomodoro' : 'pomodoros'}{state.today.seconds >= 60 ? ` · ${formatMinutes(state.today.seconds)} de foco` : ''}
          </span>
        </div>
        {custom && <CustomDurations settings={state.settings} />}
        {state.phase !== 'idle' && custom && <p className="pomodoro__note">A nova duração vale a partir da próxima fase.</p>}
        {state.link?.taskId && <p className="pomodoro__note">O tempo de foco é somado ao timer da tarefa.</p>}
      </div>
    </section>
  )
}

/** Mini-relógio flutuante, visível em qualquer tela enquanto há um pomodoro em andamento. */
export function PomodoroPill({ focusPath, hidden }: { focusPath: string; hidden?: boolean }) {
  const state = usePomodoro()
  const now = useNow(isRunning(state))
  if (hidden || state.phase === 'idle') return null
  const paused = state.endsAt === null
  return (
    <div className={`pomo-pill pomo-pill--${state.phase}`} role="status" aria-label={`${label(state)}: ${formatClock(secondsLeft(state, now))} restantes`}>
      <Link to={focusPath} className="pomo-pill__main">
        {state.phase === 'focus' ? <Timer size={16} aria-hidden /> : <Coffee size={16} aria-hidden />}
        <strong>{formatClock(secondsLeft(state, now))}</strong>
        <span>{label(state)}{paused ? ' · pausado' : ''}</span>
      </Link>
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => (paused ? pomodoro.resume() : pomodoro.pause())} aria-label={paused ? 'Continuar pomodoro' : 'Pausar pomodoro'}>
        {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
      </button>
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => pomodoro.stop()} aria-label="Parar pomodoro"><X size={16} aria-hidden /></button>
    </div>
  )
}
