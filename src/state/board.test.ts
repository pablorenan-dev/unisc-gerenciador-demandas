import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoApi, type Api } from '../lib/api'
import { useBoard, useBoards } from './board'

async function setup(overrides: Partial<Api> = {}) {
  const api: Api = { ...createDemoApi(), ...overrides }
  const [board] = await api.listBoards()
  const hook = renderHook(() => useBoard(api, board.id))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return { api, board, hook, store: () => hook.result.current }
}

const idsOf = (store: ReturnType<typeof useBoard>, column: string) => store.cards.filter((card) => card.column === column).sort((a, b) => a.position - b.position).map((card) => card.id)

afterEach(() => vi.useRealTimers())

describe('quadro: carregar', () => {
  it('começa em "carregando", sem cards falsos, e depois mostra os dados reais', async () => {
    const api = createDemoApi()
    const [board] = await api.listBoards()
    const hook = renderHook(() => useBoard(api, board.id))
    expect(hook.result.current.status).toBe('loading')
    expect(hook.result.current.cards).toEqual([])
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    expect(hook.result.current.cards.length).toBeGreaterThan(0)
  })

  it('mostra erro (e não dados de exemplo) quando a carga falha, e permite tentar de novo', async () => {
    const real = createDemoApi()
    const [board] = await real.listBoards()
    const loadBoard = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(real.loadBoard)
    const api: Api = { ...real, loadBoard }
    const hook = renderHook(() => useBoard(api, board.id))
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    expect(hook.result.current.cards).toEqual([])
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  })

  it('cria o primeiro quadro uma única vez, mesmo com duas cargas simultâneas', async () => {
    const createBoard = vi.fn(async (name: string) => ({ id: 'novo', name }))
    const api: Api = { ...createDemoApi(), listBoards: async () => [], createBoard }
    const first = renderHook(() => useBoards(api))
    const second = renderHook(() => useBoards(api))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(createBoard).toHaveBeenCalledTimes(1)
    expect(first.result.current.boards).toHaveLength(1)
  })
})

describe('quadro: mover demandas', () => {
  it('move para outra coluna na posição pedida e grava só o card movido', async () => {
    const updateCard = vi.fn(async () => {})
    const { store } = await setup({ updateCard })
    const [todo, doing] = store().columns
    const moving = idsOf(store(), todo.id)[0]
    const target = idsOf(store(), doing.id)
    await act(async () => { await store().moveCard(moving, doing.id, target[1]) })
    expect(idsOf(store(), doing.id)).toEqual([target[0], moving, target[1]])
    expect(updateCard).toHaveBeenCalledTimes(1)
    expect(updateCard).toHaveBeenCalledWith(moving, { column: doing.id, position: 1500 })
  })

  it('desfaz o movimento quando o servidor recusa (rollback)', async () => {
    const updateCard = vi.fn().mockRejectedValue(new Error('RLS'))
    const { store } = await setup({ updateCard })
    const [todo, doing] = store().columns
    const before = { todo: idsOf(store(), todo.id), doing: idsOf(store(), doing.id) }
    let ok = true
    await act(async () => { ok = await store().moveCard(before.todo[0], doing.id, null) })
    expect(ok).toBe(false)
    expect(idsOf(store(), todo.id)).toEqual(before.todo)
    expect(idsOf(store(), doing.id)).toEqual(before.doing)
  })

  it('ignora coluna inexistente em vez de fazer o card sumir', async () => {
    const { store } = await setup()
    const total = store().cards.length
    await act(async () => { await store().moveCard(store().cards[0].id, 'todo', null) })
    expect(store().cards).toHaveLength(total)
    expect(store().columns.some((column) => column.id === store().cards[0].column)).toBe(true)
  })
})

describe('quadro: disciplinas', () => {
  it('cria, e recusa nome repetido no mesmo quadro', async () => {
    const { store } = await setup()
    let created: unknown
    await act(async () => { created = await store().addDiscipline({ name: '  Redes  ', icon: 'network', color: '#3b82f6' }) })
    expect(created).toMatchObject({ name: 'Redes', icon: 'network' })
    await act(async () => { created = await store().addDiscipline({ name: 'redes', icon: 'book', color: '#3b82f6' }) })
    expect(created).toBeNull()
    expect(store().disciplines.filter((item) => item.name === 'Redes')).toHaveLength(1)
  })

  it('renomear reflete em todos os cards; excluir deixa os cards sem disciplina', async () => {
    const { store } = await setup()
    const discipline = store().disciplines.find((item) => item.name === 'Metodologia')!
    const using = store().cards.filter((card) => card.disciplineId === discipline.id).map((card) => card.id)
    expect(using.length).toBeGreaterThan(1)

    await act(async () => { await store().updateDiscipline(discipline.id, { name: 'Metodologia Científica' }) })
    expect(store().cards.filter((card) => using.includes(card.id)).every((card) => card.discipline === 'Metodologia Científica')).toBe(true)

    await act(async () => { await store().deleteDiscipline(discipline.id) })
    const after = store().cards.filter((card) => using.includes(card.id))
    expect(after).toHaveLength(using.length)
    expect(after.every((card) => card.disciplineId === null && card.discipline === '')).toBe(true)
  })

  it('grava o id e o nome da disciplina ao salvar o card', async () => {
    const updateCard = vi.fn(async () => {})
    const { store } = await setup({ updateCard })
    const target = store().disciplines.find((item) => item.name === 'Compiladores')!
    const card = store().cards.find((item) => item.disciplineId !== target.id)!
    await act(async () => { await store().saveCard({ ...card, disciplineId: target.id }) })
    expect(updateCard).toHaveBeenCalledWith(card.id, expect.objectContaining({ disciplineId: target.id, discipline: 'Compiladores' }))
  })

  it('desfaz a exclusão da disciplina se o servidor recusar', async () => {
    const { store } = await setup({ deleteDiscipline: vi.fn().mockRejectedValue(new Error('RLS')) })
    const total = store().disciplines.length
    await act(async () => { await store().deleteDiscipline(store().disciplines[0].id) })
    expect(store().disciplines).toHaveLength(total)
  })
})

describe('quadro: salvar, duplicar e excluir', () => {
  it('salva tarefas por id e informa quais foram removidas, sem apagar todas', async () => {
    const saveTasks = vi.fn(async () => {})
    const { store } = await setup({ saveTasks })
    const card = store().cards.find((item) => item.tasks.length >= 2)!
    const kept = card.tasks.slice(1)
    await act(async () => { await store().saveCard({ ...card, tasks: kept }) })
    expect(saveTasks).toHaveBeenCalledWith(card.id, kept, [card.tasks[0].id])
  })

  it('restaura o card quando salvar falha', async () => {
    const { store } = await setup({ updateCard: vi.fn().mockRejectedValue(new Error('falhou')) })
    const card = store().cards[0]
    let ok = true
    await act(async () => { ok = await store().saveCard({ ...card, title: 'Outro título' }) })
    expect(ok).toBe(false)
    expect(store().cards.find((item) => item.id === card.id)?.title).toBe(card.title)
  })

  it('não cria demanda sem título e corta títulos acima do limite do banco', async () => {
    const { store } = await setup()
    let created: unknown
    await act(async () => { created = await store().addCard({ title: '   ' }) })
    expect(created).toBeNull()
    await act(async () => { created = await store().addCard({ title: 'x'.repeat(300) }) })
    expect((created as { title: string }).title).toHaveLength(200)
  })

  it('duplica levando as tarefas para o servidor', async () => {
    const { api, board, store } = await setup()
    const source = store().cards.find((item) => item.tasks.length > 0)!
    await act(async () => { await store().duplicateCard(source.id) })
    const saved = (await api.loadBoard(board.id)).cards.find((item) => item.title === `${source.title} (cópia)`)
    expect(saved?.tasks).toHaveLength(source.tasks.length)
  })

  it('exclui só depois da janela de "Desfazer"', async () => {
    const deleteCard = vi.fn(async () => {})
    const { store } = await setup({ deleteCard })
    vi.useFakeTimers()
    const id = store().cards[0].id
    act(() => store().deleteCard(id))
    expect(store().cards.some((card) => card.id === id)).toBe(false)
    expect(deleteCard).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(5100) })
    expect(deleteCard).toHaveBeenCalledWith(id)
  })

  it('não deixa excluir a última coluna', async () => {
    const deleteColumn = vi.fn(async () => {})
    const { store } = await setup({ deleteColumn })
    for (const column of store().columns.slice(1)) await act(async () => { await store().deleteColumn(column.id) })
    expect(store().columns).toHaveLength(1)
    await act(async () => { await store().deleteColumn(store().columns[0].id) })
    expect(store().columns).toHaveLength(1)
    expect(deleteColumn).toHaveBeenCalledTimes(3)
  })
})
