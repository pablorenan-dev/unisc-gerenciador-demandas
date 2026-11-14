import { describe, expect, it } from 'vitest'
import { advance, initialState, parseState, pause, resume, secondsLeft, skipBreak, startFocus, stop, takeBreak, type PomodoroLink } from './pomodoro'

const t0 = new Date(2026, 10, 13, 20, 0, 0).getTime()
const min = 60_000
const link: PomodoroLink = { boardId: 'b', cardId: 'card-1', cardTitle: 'Trabalho', taskId: 'task-1', taskTitle: 'Escrever relatório' }

describe('pomodoro', () => {
  it('foco de 25 min vira pausa curta, conta no dia e credita o tempo na tarefa', () => {
    const focus = startFocus(initialState(t0), t0, link)
    expect(secondsLeft(focus, t0 + 10 * min)).toBe(15 * 60)
    expect(advance(focus, t0 + 24 * min).event).toBeNull()

    const done = advance(focus, t0 + 25 * min)
    expect(done.event).toBe('focus-end')
    expect(done.state.phase).toBe('break')
    expect(done.state.total).toBe(5 * 60)
    expect(done.state.today).toMatchObject({ count: 1, seconds: 25 * 60 })
    expect(done.credit).toMatchObject({ cardId: 'card-1', taskId: 'task-1', seconds: 25 * 60 })

    const ready = advance(done.state, t0 + 30 * min)
    expect(ready.event).toBe('break-end')
    expect(ready.state.phase).toBe('idle')
    expect(ready.state.link).toEqual(link)
  })

  it('a cada 4 focos a pausa é longa', () => {
    let state = initialState(t0)
    let now = t0
    for (let round = 1; round <= 4; round += 1) {
      state = startFocus(state, now, null)
      now += 25 * min
      state = advance(state, now).state
      expect(state.long).toBe(round === 4)
      now += state.total * 1000
      state = advance(state, now).state
    }
    expect(state.today.count).toBe(4)
    expect(state.cycle).toBe(0)
  })

  it('pausar congela o tempo; continuar retoma de onde parou', () => {
    const focus = startFocus(initialState(t0), t0, null)
    const paused = pause(focus, t0 + 5 * min)
    expect(secondsLeft(paused, t0 + 60 * min)).toBe(20 * 60)
    expect(advance(paused, t0 + 60 * min).event).toBeNull()
    const resumed = resume(paused, t0 + 60 * min)
    expect(secondsLeft(resumed, t0 + 70 * min)).toBe(10 * 60)
  })

  it('parar no meio credita o tempo cumprido mas não conta pomodoro; menos de 1 minuto não credita', () => {
    const focus = startFocus(initialState(t0), t0, link)
    const early = stop(focus, t0 + 12 * min)
    expect(early.credit?.seconds).toBe(12 * 60)
    expect(early.state.today).toMatchObject({ count: 0, seconds: 12 * 60 })
    expect(stop(focus, t0 + 30_000).credit).toBeNull()
  })

  it('créditos de dois focos iguais na mesma tarefa são distintos', () => {
    const first = advance(startFocus(initialState(t0), t0, link), t0 + 25 * min)
    const second = advance(startFocus(first.state, t0 + 31 * min, link), t0 + 56 * min)
    expect(first.credit?.id).not.toBe(second.credit?.id)
  })

  it('pular a pausa já começa o próximo foco; o contador zera ao virar o dia', () => {
    const inBreak = advance(startFocus(initialState(t0), t0, null), t0 + 25 * min).state
    expect(skipBreak(inBreak, t0 + 26 * min).phase).toBe('focus')
    const tomorrow = startFocus(inBreak, t0 + 24 * 60 * min, null)
    expect(tomorrow.today.count).toBe(0)
  })

  it('começar pela pausa: 5 min de descanso e o foco de 25 começa sozinho, sem contar pomodoro', () => {
    const resting = takeBreak({ ...initialState(t0), link }, t0)
    expect(resting.credit).toBeNull()
    expect(resting.state).toMatchObject({ phase: 'break', long: false, thenFocus: true, total: 5 * 60 })
    expect(advance(resting.state, t0 + 4 * min).event).toBeNull()

    const back = advance(resting.state, t0 + 5 * min)
    expect(back.event).toBe('break-end')
    expect(back.state).toMatchObject({ phase: 'focus', thenFocus: false, total: 25 * 60, link })
    expect(back.state.today.count).toBe(0)

    // Depois desse foco, o ciclo segue normal: pausa comum, que termina em "pronto".
    const normal = advance(back.state, t0 + 30 * min).state
    expect(normal).toMatchObject({ phase: 'break', thenFocus: false })
    expect(advance(normal, t0 + 35 * min).state.phase).toBe('idle')
  })

  it('fazer uma pausa no meio do foco credita o tempo cumprido e volta para o foco depois', () => {
    const focus = startFocus(initialState(t0), t0, link)
    const resting = takeBreak(focus, t0 + 12 * min)
    expect(resting.credit?.seconds).toBe(12 * 60)
    expect(resting.state).toMatchObject({ phase: 'break', thenFocus: true })
    expect(resting.state.today).toMatchObject({ count: 0, seconds: 12 * 60 })
    expect(advance(resting.state, t0 + 17 * min).state.phase).toBe('focus')
    // Já em pausa, pedir de novo não reinicia o relógio.
    expect(takeBreak(resting.state, t0 + 14 * min).state).toBe(resting.state)
  })

  it('pausa que emendaria no foco só encerra se o app ficou fechado; parar ou pular desfaz o combinado', () => {
    const resting = takeBreak(initialState(t0), t0).state
    expect(advance(resting, t0 + 3 * 60 * min).state).toMatchObject({ phase: 'idle', thenFocus: false })
    expect(stop(resting, t0 + min).state).toMatchObject({ phase: 'idle', thenFocus: false })
    expect(skipBreak(resting, t0 + min)).toMatchObject({ phase: 'focus', thenFocus: false })
    expect(parseState({ phase: 'idle', thenFocus: true }, t0).thenFocus).toBe(false)
  })

  it('estado salvo malformado ou adulterado volta ao padrão seguro', () => {
    expect(parseState('lixo', t0).phase).toBe('idle')
    const parsed = parseState({ phase: 'focus', endsAt: t0 + min, settings: { focus: 9999, shortBreak: -3 }, link: { cardId: 'x', taskId: 5 } }, t0)
    expect(parsed.settings.focus).toBe(120)
    expect(parsed.settings.shortBreak).toBe(5) // inválido volta ao padrão
    expect(parsed.link?.taskId).toBeNull()
  })
})
