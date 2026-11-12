import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Api, BoardData } from '../lib/api'
import { byPosition, nextPosition, planMove } from '../lib/order'
import { BOARD_NAME_MAX, COLUMN_TITLE_MAX, DISCIPLINE_NAME_MAX, TITLE_MAX, type Board, type Card, type CardInput, type Column, type Discipline, type DisciplineInput } from '../lib/types'
import { catSay, toast } from './feedback'

/* ---------------------------------- Quadros ---------------------------------- */

// Uma única carga por sessão de API: evita criar dois quadros quando o efeito roda duas vezes.
const boardLists = new WeakMap<Api, Promise<Board[]>>()

function defaultBoardName(now = new Date()) {
  return `Demandas ${now.getFullYear()}/${now.getMonth() < 6 ? 1 : 2}`
}

function ensureBoards(api: Api): Promise<Board[]> {
  let pending = boardLists.get(api)
  if (!pending) {
    pending = api.listBoards().then(async (boards) => (boards.length ? boards : [await api.createBoard(defaultBoardName())]))
    boardLists.set(api, pending)
    pending.catch(() => boardLists.delete(api))
  }
  return pending
}

export type BoardsState = {
  status: 'loading' | 'ready' | 'error'
  boards: Board[]
  retry: () => void
  createBoard: (name: string) => Promise<Board | null>
  renameBoard: (id: string, name: string) => Promise<boolean>
  deleteBoard: (id: string) => Promise<boolean>
}

export function useBoards(api: Api): BoardsState {
  const [status, setStatus] = useState<BoardsState['status']>('loading')
  const [boards, setBoards] = useState<Board[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    ensureBoards(api).then(
      (list) => { if (active) { setBoards(list); setStatus('ready') } },
      () => { if (active) setStatus('error') },
    )
    return () => { active = false }
  }, [api, attempt])

  // Mantém o cache em dia: se a área logada for remontada, a lista já inclui quadros criados/removidos.
  useEffect(() => { if (status === 'ready') boardLists.set(api, Promise.resolve(boards)) }, [api, boards, status])

  const retry = useCallback(() => { setStatus('loading'); setAttempt((value) => value + 1) }, [])

  const createBoard = useCallback(async (rawName: string) => {
    const name = rawName.trim().slice(0, BOARD_NAME_MAX)
    if (!name) return null
    try {
      const board = await api.createBoard(name)
      setBoards((current) => [...current, board])
      toast.success(`Quadro "${name}" criado.`)
      return board
    } catch {
      toast.error('Não foi possível criar o quadro.')
      return null
    }
  }, [api])

  const renameBoard = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim().slice(0, BOARD_NAME_MAX)
    if (!name) return false
    try {
      await api.renameBoard(id, name)
      setBoards((current) => current.map((board) => (board.id === id ? { ...board, name } : board)))
      return true
    } catch {
      toast.error('Não foi possível renomear o quadro.')
      return false
    }
  }, [api])

  const deleteBoard = useCallback(async (id: string) => {
    try {
      await api.deleteBoard(id)
      setBoards((current) => current.filter((board) => board.id !== id))
      toast.success('Quadro excluído.')
      return true
    } catch {
      toast.error('Não foi possível excluir o quadro.')
      return false
    }
  }, [api])

  return { status, boards, retry, createBoard, renameBoard, deleteBoard }
}

/* --------------------------------- Um quadro --------------------------------- */

export type NewCard = Partial<Omit<CardInput, 'title' | 'column'>> & { title: string; column?: string }

const UNDO_MS = 5000

const emptyData: BoardData = { columns: [], cards: [], disciplines: [], disciplinesReady: true, notesReady: true }

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR')
const byName = (a: Discipline, b: Discipline) => a.name.localeCompare(b.name, 'pt-BR')

/**
 * O nome exibido no card vem sempre do cadastro de disciplinas. Assim, renomear ou excluir
 * uma disciplina reflete em todos os cards sem cada tela precisar fazer a consulta.
 */
function withDisciplineNames(data: BoardData): BoardData {
  if (!data.disciplinesReady) return data
  const names = new Map(data.disciplines.map((discipline) => [discipline.id, discipline.name]))
  let changed = false
  const cards = data.cards.map((card) => {
    if (!card.disciplineId) return card
    const name = names.get(card.disciplineId)
    if (name === undefined) { changed = true; return { ...card, disciplineId: null, discipline: '' } }
    if (name === card.discipline) return card
    changed = true
    return { ...card, discipline: name }
  })
  return changed ? { ...data, cards } : data
}

export function useBoard(api: Api, boardId: string | undefined) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<BoardData>(emptyData)
  const dataRef = useRef<BoardData>(emptyData)
  const pendingWrites = useRef(0)
  const pendingDeletes = useRef(new Map<string, { timer: number; run: () => void }>())
  const [attempt, setAttempt] = useState(0)

  /** Única porta de escrita do estado: mantém a ref sincronizada para as ações lerem o valor atual. */
  const commit = useCallback((next: BoardData) => {
    const normalized = withDisciplineNames(next)
    dataRef.current = normalized
    setData(normalized)
  }, [])

  const fetchBoard = useCallback(async (silent: boolean) => {
    if (!boardId) return
    try {
      const loaded = await api.loadBoard(boardId)
      // Não sobrescreve o estado se o usuário mexeu em algo enquanto a busca silenciosa acontecia.
      if (silent && (pendingWrites.current > 0 || pendingDeletes.current.size > 0)) return
      commit({ ...loaded, columns: [...loaded.columns].sort(byPosition), cards: [...loaded.cards].sort(byPosition) })
      setStatus('ready')
    } catch {
      if (!silent) setStatus('error')
    }
  }, [api, boardId, commit])

  useEffect(() => {
    let active = true
    const deletes = pendingDeletes.current
    if (boardId) {
      api.loadBoard(boardId).then(
        (loaded) => { if (active) { commit({ ...loaded, columns: [...loaded.columns].sort(byPosition), cards: [...loaded.cards].sort(byPosition) }); setStatus('ready') } },
        () => { if (active) setStatus('error') },
      )
    }
    return () => {
      active = false
      // Exclusões aguardando "Desfazer" são efetivadas ao sair do quadro.
      deletes.forEach((entry) => { window.clearTimeout(entry.timer); entry.run() })
      deletes.clear()
    }
  }, [api, boardId, attempt, commit])

  // Outra aba (ou outro aparelho) pode ter alterado o quadro: atualiza ao voltar para a aba.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchBoard(true) }
    const flush = () => { pendingDeletes.current.forEach((entry) => { window.clearTimeout(entry.timer); entry.run() }); pendingDeletes.current.clear() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', flush)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pagehide', flush) }
  }, [fetchBoard])

  /** Aplica a mudança na hora; se o servidor recusar, volta ao estado anterior e busca a verdade. */
  const optimistic = useCallback(async (next: BoardData, write: () => Promise<unknown>, failure: string): Promise<boolean> => {
    const previous = dataRef.current
    commit(next)
    pendingWrites.current += 1
    try {
      await write()
      return true
    } catch {
      commit(previous)
      toast.error(failure)
      window.setTimeout(() => void fetchBoard(true), 0)
      return false
    } finally {
      pendingWrites.current -= 1
    }
  }, [commit, fetchBoard])

  const actions = useMemo(() => {
    const columnCards = (columnId: string, exceptId?: string) => dataRef.current.cards.filter((card) => card.column === columnId && card.id !== exceptId).sort(byPosition)

    return {
      retry: () => { setStatus('loading'); setAttempt((value) => value + 1) },

      async addCard(input: NewCard): Promise<Card | null> {
        const current = dataRef.current
        const title = input.title.trim().slice(0, TITLE_MAX)
        const column = current.columns.find((item) => item.id === input.column) ?? current.columns[0]
        if (!boardId || !title || !column) return null
        const full = {
          description: '', disciplineId: null, discipline: '', notesCount: 0, type: 'trabalho' as const, priority: 'media' as const, dueStart: '', due: '', labels: [], tasks: [],
          ...input, title, column: column.id, position: nextPosition(columnCards(column.id)),
        }
        // O nome acompanha o id (a coluna de texto antiga continua sendo preenchida).
        if (full.disciplineId) full.discipline = current.disciplines.find((item) => item.id === full.disciplineId)?.name ?? ''
        try {
          const card = await api.createCard(boardId, full)
          commit({ ...dataRef.current, cards: [...dataRef.current.cards, card] })
          return card
        } catch {
          toast.error('Não foi possível criar a demanda.')
          return null
        }
      },

      async saveCard(updated: Card): Promise<boolean> {
        const current = dataRef.current
        const before = current.cards.find((card) => card.id === updated.id)
        if (!before) return false
        const card: Card = { ...updated, title: updated.title.trim().slice(0, TITLE_MAX) }
        if (!card.title) return false
        if (card.disciplineId) card.discipline = current.disciplines.find((item) => item.id === card.disciplineId)?.name ?? ''
        // Trocou de coluna pelo formulário: vai para o fim da nova coluna.
        if (card.column !== before.column) card.position = nextPosition(columnCards(card.column, card.id))
        const removed = before.tasks.filter((task) => !card.tasks.some((item) => item.id === task.id)).map((task) => task.id)
        const tasksChanged = JSON.stringify(before.tasks) !== JSON.stringify(card.tasks)
        return optimistic(
          { ...current, cards: current.cards.map((item) => (item.id === card.id ? card : item)) },
          async () => {
            await api.updateCard(card.id, { title: card.title, description: card.description, disciplineId: card.disciplineId, discipline: card.discipline, type: card.type, priority: card.priority, dueStart: card.dueStart, due: card.due, labels: card.labels, column: card.column, position: card.position })
            if (tasksChanged) await api.saveTasks(card.id, card.tasks, removed)
          },
          'Não foi possível salvar a demanda. Suas alterações foram desfeitas.',
        )
      },

      /** Move para `toColumn`, antes de `beforeId` (ou para o fim, se `null`). */
      async moveCard(id: string, toColumn: string, beforeId: string | null): Promise<boolean> {
        const current = dataRef.current
        const moving = current.cards.find((card) => card.id === id)
        if (!moving || !current.columns.some((column) => column.id === toColumn)) return false
        const siblings = columnCards(toColumn, id)
        const beforeIndex = beforeId ? siblings.findIndex((card) => card.id === beforeId) : -1
        const index = beforeIndex === -1 ? siblings.length : beforeIndex
        const sameSpot = moving.column === toColumn && columnCards(toColumn).findIndex((card) => card.id === id) === index
        if (sameSpot) return true
        const plan = planMove(siblings, index)
        const positions = new Map(plan.renumber.map((item) => [item.id, item.position]))
        const cards = current.cards
          .map((card) => (card.id === id ? { ...card, column: toColumn, position: plan.position } : positions.has(card.id) ? { ...card, position: positions.get(card.id) as number } : card))
          .sort(byPosition)
        const ok = await optimistic(
          { ...current, cards },
          () => Promise.all([
            api.updateCard(id, { column: toColumn, position: plan.position }),
            ...plan.renumber.map((item) => api.updateCard(item.id, { position: item.position })),
          ]),
          'Não foi possível mover a demanda. Ela voltou para o lugar.',
        )
        const last = current.columns[current.columns.length - 1]
        if (ok && moving.column !== toColumn && last?.id === toColumn && current.columns.length > 1) catSay(`"${moving.title}" concluída! Orgulho define.`, 'party')
        return ok
      },

      /** Remove da tela na hora e só apaga no servidor depois da janela de "Desfazer". */
      deleteCard(id: string) {
        const current = dataRef.current
        const card = current.cards.find((item) => item.id === id)
        if (!card) return
        commit({ ...current, cards: current.cards.filter((item) => item.id !== id) })
        const run = () => {
          pendingDeletes.current.delete(id)
          api.deleteCard(id).catch(() => {
            commit({ ...dataRef.current, cards: [...dataRef.current.cards, card].sort(byPosition) })
            toast.error('Não foi possível excluir a demanda. Ela foi restaurada.')
          })
        }
        const timer = window.setTimeout(run, UNDO_MS)
        pendingDeletes.current.set(id, { timer, run })
        toast.info('Demanda excluída.', {
          mood: 'curious',
          duration: UNDO_MS,
          action: {
            label: 'Desfazer',
            run: () => {
              const entry = pendingDeletes.current.get(id)
              if (!entry) return
              window.clearTimeout(entry.timer)
              pendingDeletes.current.delete(id)
              commit({ ...dataRef.current, cards: [...dataRef.current.cards, card].sort(byPosition) })
            },
          },
        })
      },

      async duplicateCard(id: string): Promise<Card | null> {
        const source = dataRef.current.cards.find((card) => card.id === id)
        if (!boardId || !source) return null
        const { id: _id, ...rest } = source
        void _id
        try {
          const card = await api.createCard(boardId, {
            ...rest,
            title: `${source.title} (cópia)`.slice(0, TITLE_MAX),
            notesCount: 0,
            position: nextPosition(columnCards(source.column)),
            tasks: source.tasks.map((task) => ({ ...task, id: crypto.randomUUID(), timerStartedAt: null })),
          })
          commit({ ...dataRef.current, cards: [...dataRef.current.cards, card] })
          toast.success('Demanda duplicada.')
          return card
        } catch {
          toast.error('Não foi possível duplicar a demanda.')
          return null
        }
      },

      async addColumn(rawTitle: string, color = '#a78bfa'): Promise<boolean> {
        const title = rawTitle.trim().slice(0, COLUMN_TITLE_MAX)
        if (!boardId || !title) return false
        try {
          const column = await api.createColumn(boardId, title, color, nextPosition(dataRef.current.columns))
          commit({ ...dataRef.current, columns: [...dataRef.current.columns, column] })
          return true
        } catch {
          toast.error('Não foi possível criar a coluna.')
          return false
        }
      },

      updateColumn(id: string, patch: { title?: string; color?: string }): Promise<boolean> {
        const current = dataRef.current
        const clean = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, COLUMN_TITLE_MAX) } : {}) }
        if (clean.title !== undefined && !clean.title) return Promise.resolve(false)
        return optimistic(
          { ...current, columns: current.columns.map((column) => (column.id === id ? { ...column, ...clean } : column)) },
          () => api.updateColumn(id, clean),
          'Não foi possível salvar a coluna.',
        )
      },

      shiftColumn(id: string, direction: -1 | 1): Promise<boolean> {
        const current = dataRef.current
        const index = current.columns.findIndex((column) => column.id === id)
        const target = index + direction
        if (!boardId || index < 0 || target < 0 || target >= current.columns.length) return Promise.resolve(false)
        const ordered = [...current.columns]
        ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
        const columns = ordered.map((column, position) => ({ ...column, position: (position + 1) * 1000 }))
        return optimistic({ ...current, columns }, () => api.reorderColumns(boardId, columns.map((column) => column.id)), 'Não foi possível reordenar as colunas.')
      },

      deleteColumn(id: string): Promise<boolean> {
        const current = dataRef.current
        if (current.columns.length <= 1) {
          toast.error('O quadro precisa de pelo menos uma coluna.')
          return Promise.resolve(false)
        }
        return optimistic(
          { ...current, columns: current.columns.filter((column) => column.id !== id), cards: current.cards.filter((card) => card.column !== id) },
          () => api.deleteColumn(id),
          'Não foi possível excluir a coluna.',
        )
      },

      /** Atualiza só a contagem exibida no card (as observações são gravadas pela tela do card). */
      setNotesCount(cardId: string, count: number) {
        const current = dataRef.current
        if (!current.cards.some((card) => card.id === cardId && card.notesCount !== count)) return
        commit({ ...current, cards: current.cards.map((card) => (card.id === cardId ? { ...card, notesCount: count } : card)) })
      },

      /* ------------------------------ Disciplinas ------------------------------ */

      async addDiscipline(input: DisciplineInput): Promise<Discipline | null> {
        const name = input.name.trim().slice(0, DISCIPLINE_NAME_MAX)
        if (!boardId || !name) return null
        if (dataRef.current.disciplines.some((item) => sameName(item.name, name))) {
          toast.error('Já existe uma disciplina com esse nome neste quadro.')
          return null
        }
        try {
          const discipline = await api.createDiscipline(boardId, { ...input, name })
          commit({ ...dataRef.current, disciplines: [...dataRef.current.disciplines, discipline].sort(byName) })
          return discipline
        } catch {
          toast.error('Não foi possível criar a disciplina.')
          return null
        }
      },

      updateDiscipline(id: string, patch: Partial<DisciplineInput>): Promise<boolean> {
        const current = dataRef.current
        const clean = { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, DISCIPLINE_NAME_MAX) } : {}) }
        if (clean.name !== undefined) {
          if (!clean.name) return Promise.resolve(false)
          if (current.disciplines.some((item) => item.id !== id && sameName(item.name, clean.name as string))) {
            toast.error('Já existe uma disciplina com esse nome neste quadro.')
            return Promise.resolve(false)
          }
        }
        return optimistic(
          { ...current, disciplines: current.disciplines.map((item) => (item.id === id ? { ...item, ...clean } : item)).sort(byName) },
          () => api.updateDiscipline(id, clean),
          'Não foi possível salvar a disciplina.',
        )
      },

      /** As demandas continuam existindo; só ficam sem disciplina. */
      deleteDiscipline(id: string): Promise<boolean> {
        const current = dataRef.current
        return optimistic(
          { ...current, disciplines: current.disciplines.filter((item) => item.id !== id) },
          () => api.deleteDiscipline(id),
          'Não foi possível excluir a disciplina.',
        )
      },
    }
  }, [api, boardId, commit, optimistic])

  return { status, columns: data.columns as Column[], cards: data.cards, disciplines: data.disciplines, disciplinesReady: data.disciplinesReady, notesReady: data.notesReady, ...actions }
}

export type BoardStore = ReturnType<typeof useBoard>
