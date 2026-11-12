import { useEffect, useState, type CSSProperties } from 'react'
import { Coffee, Pause, Play, SkipForward, Square, Timer, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatClock, isRunning, moodFor, presets, secondsLeft, type PomodoroLink, type PomodoroState } from '../../lib/pomodoro'
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
        </div>
      </div>

      <div className="pomodoro__side">
        <div>
          <p className="eyebrow">Pomodoro</p>
          <h2>{state.phase === 'focus' ? 'Foco total. O Chiquinho está dormindo.' : state.phase === 'break' ? 'Pausa merecida.' : 'Bora focar?'}</h2>
          <p className="pomodoro__hint">
            {state.phase === 'focus' ? 'Celular longe, uma coisa de cada vez.' : state.phase === 'break' ? 'Levanta, bebe água, olha pela janela.' : `${state.settings.focus} min de foco, ${state.settings.shortBreak} de pausa. A cada ${state.settings.longEvery} focos, uma pausa de ${state.settings.longBreak}.`}
          </p>
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
          {state.phase !== 'idle' && (paused
            ? <button type="button" className="btn btn--primary" onClick={() => pomodoro.resume()}><Play size={18} aria-hidden /> Continuar</button>
            : <button type="button" className="btn btn--primary" onClick={() => pomodoro.pause()}><Pause size={18} aria-hidden /> Pausar</button>)}
          {state.phase === 'break' && <button type="button" className="btn" onClick={() => pomodoro.skipBreak()}><SkipForward size={18} aria-hidden /> Pular pausa</button>}
          {state.phase !== 'idle' && <button type="button" className="btn btn--ghost" onClick={() => pomodoro.stop()}><Square size={16} aria-hidden /> Parar</button>}
        </div>

        <div className="pomodoro__footer">
          <div className="segmented" role="radiogroup" aria-label="Duração">
            {presets.map((preset) => (
              <button key={preset.label} type="button" role="radio" aria-checked={currentPreset === preset} className={currentPreset === preset ? 'is-active' : ''} onClick={() => pomodoro.setSettings(preset.settings)}>{preset.label}</button>
            ))}
          </div>
          <span className="pomodoro__today">
            Hoje: <strong>{state.today.count}</strong> {state.today.count === 1 ? 'pomodoro' : 'pomodoros'}{state.today.seconds >= 60 ? ` · ${formatMinutes(state.today.seconds)} de foco` : ''}
          </span>
        </div>
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
