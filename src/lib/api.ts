import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, toISODate } from './dates'
import { byPosition, STEP } from './order'
import { defaultColumns, type Board, type Card, type CardInput, type CardType, type Column, type Priority, type Task } from './types'

export type CardPatch = Partial<Pick<Card, 'title' | 'description' | 'discipline' | 'type' | 'priority' | 'dueStart' | 'due' | 'labels' | 'column' | 'position'>>
export type ColumnPatch = Partial<Pick<Column, 'title' | 'color' | 'position'>>
export type BoardData = { columns: Column[]; cards: Card[] }

/** Tudo que a interface precisa do backend. A autorização real é a RLS do banco. */
export interface Api {
  listBoards(): Promise<Board[]>
  createBoard(name: string): Promise<Board>
  renameBoard(id: string, name: string): Promise<void>
  deleteBoard(id: string): Promise<void>
  loadBoard(id: string): Promise<BoardData>
  createColumn(boardId: string, title: string, color: string, position: number): Promise<Column>
  updateColumn(id: string, patch: ColumnPatch): Promise<void>
  /** Regrava a posição de todas as colunas na ordem informada. */
  reorderColumns(boardId: string, orderedIds: string[]): Promise<void>
  deleteColumn(id: string): Promise<void>
  createCard(boardId: string, input: CardInput & { position: number }): Promise<Card>
  updateCard(id: string, patch: CardPatch): Promise<void>
  saveTasks(cardId: string, tasks: Task[], removedIds: string[]): Promise<void>
  deleteCard(id: string): Promise<void>
  deleteAccount(): Promise<void>
}

type Result = { error: { message: string; code?: string } | null }

function check<T extends Result>(result: T): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code })
  return result
}

type TaskRow = { id: string; titulo: string; concluida: boolean; tempo_segundos: number | null; timer_iniciado_em: string | null; posicao: number | null; created_at?: string }
type CardRow = { id: string; column_id: string; posicao: number; titulo: string; descricao: string | null; disciplina: string | null; tipo: CardType; prioridade: Priority; data_inicio: string | null; data_entrega: string | null; labels: string[] | null; created_at?: string; tasks?: TaskRow[] }
type ColumnRow = { id: string; nome: string; cor: string; posicao: number }

const CARD_FIELDS = 'id, column_id, posicao, titulo, descricao, disciplina, tipo, prioridade, data_inicio, data_entrega, labels, created_at'
const TASK_FIELDS = 'id, titulo, concluida, tempo_segundos, timer_iniciado_em, posicao, created_at'

function toTask(row: TaskRow): Task {
  return { id: row.id, title: row.titulo, done: row.concluida, elapsedSeconds: row.tempo_segundos ?? 0, timerStartedAt: row.timer_iniciado_em }
}

function toCard(row: CardRow): Card {
  const tasks = [...(row.tasks ?? [])].sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  return {
    id: row.id,
    column: row.column_id,
    position: row.posicao,
    title: row.titulo,
    description: row.descricao ?? '',
    discipline: row.disciplina ?? '',
    type: row.tipo,
    priority: row.prioridade,
    dueStart: row.data_inicio ?? '',
    due: row.data_entrega ?? '',
    labels: row.labels ?? [],
    tasks: tasks.map(toTask),
  }
}

/** A cor vai para um `style`; só aceitamos hexadecimal, venha de onde vier (banco ou tela). */
export function safeColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#a8a29e'
}

const toColumn = (row: ColumnRow): Column => ({ id: row.id, title: row.nome, color: safeColor(row.cor), position: row.posicao })

function cardPatchToRow(patch: CardPatch) {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.titulo = patch.title
  if (patch.description !== undefined) row.descricao = patch.description
  if (patch.discipline !== undefined) row.disciplina = patch.discipline
  if (patch.type !== undefined) row.tipo = patch.type
  if (patch.priority !== undefined) row.prioridade = patch.priority
  if (patch.dueStart !== undefined) row.data_inicio = patch.dueStart || null
  if (patch.due !== undefined) row.data_entrega = patch.due || null
  if (patch.labels !== undefined) row.labels = patch.labels
  if (patch.column !== undefined) row.column_id = patch.column
  if (patch.position !== undefined) row.posicao = patch.position
  return row
}

const taskToRow = (cardId: string) => (task: Task, index: number) => ({
  id: task.id,
  card_id: cardId,
  titulo: task.title,
  concluida: task.done,
  tempo_segundos: task.elapsedSeconds,
  timer_iniciado_em: task.timerStartedAt,
  posicao: (index + 1) * STEP,
})

export function createSupabaseApi(client: SupabaseClient, userId: string): Api {
  return {
    async listBoards() {
      const { data } = check(await client.from('boards').select('id, nome').order('created_at', { ascending: true }))
      return ((data ?? []) as { id: string; nome: string }[]).map((row) => ({ id: row.id, name: row.nome }))
    },

    async createBoard(name) {
      // As colunas padrão e o vínculo de dono são criados pelo trigger `handle_new_board`.
      const { data } = check(await client.from('boards').insert({ nome: name, owner_id: userId }).select('id, nome').single())
      const row = data as { id: string; nome: string }
      return { id: row.id, name: row.nome }
    },

    async renameBoard(id, name) {
      check(await client.from('boards').update({ nome: name }).eq('id', id))
    },

    async deleteBoard(id) {
      check(await client.from('boards').delete().eq('id', id))
    },

    async loadBoard(id) {
      let { data: columnRows } = check(await client.from('columns').select('id, nome, cor, posicao').eq('board_id', id).order('posicao', { ascending: true }))
      if (!columnRows?.length) {
        const created = check(await client.from('columns').insert(defaultColumns.map((column, index) => ({ board_id: id, nome: column.title, cor: column.color, posicao: (index + 1) * STEP }))).select('id, nome, cor, posicao'))
        columnRows = created.data
      }
      const { data: cardRows } = check(await client.from('cards').select(`${CARD_FIELDS}, tasks(${TASK_FIELDS})`).eq('board_id', id).order('posicao', { ascending: true }).order('created_at', { ascending: true }))
      return {
        columns: ((columnRows ?? []) as ColumnRow[]).map(toColumn),
        cards: ((cardRows ?? []) as unknown as CardRow[]).map(toCard),
      }
    },

    async createColumn(boardId, title, color, position) {
      const { data } = check(await client.from('columns').insert({ board_id: boardId, nome: title, cor: safeColor(color), posicao: position }).select('id, nome, cor, posicao').single())
      return toColumn(data as ColumnRow)
    },

    async updateColumn(id, patch) {
      const row: Record<string, unknown> = {}
      if (patch.title !== undefined) row.nome = patch.title
      if (patch.color !== undefined) row.cor = safeColor(patch.color)
      if (patch.position !== undefined) row.posicao = patch.position
      check(await client.from('columns').update(row).eq('id', id))
    },

    async reorderColumns(boardId, orderedIds) {
      // `unique (board_id, posicao)`: primeiro tira todas do caminho (negativas), depois grava as finais.
      for (const [index, id] of orderedIds.entries()) check(await client.from('columns').update({ posicao: -(index + 1) }).eq('id', id).eq('board_id', boardId))
      for (const [index, id] of orderedIds.entries()) check(await client.from('columns').update({ posicao: (index + 1) * STEP }).eq('id', id).eq('board_id', boardId))
    },

    async deleteColumn(id) {
      check(await client.from('cards').delete().eq('column_id', id))
      check(await client.from('columns').delete().eq('id', id))
    },

    async createCard(boardId, input) {
      const { data } = check(await client.from('cards').insert({ board_id: boardId, ...cardPatchToRow(input) }).select(CARD_FIELDS).single())
      const card = toCard(data as unknown as CardRow)
      if (input.tasks.length) check(await client.from('tasks').insert(input.tasks.map(taskToRow(card.id))))
      return { ...card, tasks: input.tasks }
    },

    async updateCard(id, patch) {
      check(await client.from('cards').update(cardPatchToRow(patch)).eq('id', id))
    },

    async saveTasks(cardId, tasks, removedIds) {
      // Grava primeiro, apaga depois: uma falha no meio nunca deixa o card sem tarefas.
      if (tasks.length) check(await client.from('tasks').upsert(tasks.map(taskToRow(cardId)), { onConflict: 'id' }))
      if (removedIds.length) check(await client.from('tasks').delete().in('id', removedIds).eq('card_id', cardId))
    },

    async deleteCard(id) {
      check(await client.from('cards').delete().eq('id', id))
    },

    async deleteAccount() {
      check(await client.rpc('delete_my_account'))
    },
  }
}

/* ------------------------------ Modo demonstração ------------------------------ */

let demoCounter = 0
const demoId = (prefix: string) => `${prefix}-${(demoCounter += 1)}`

type DemoBoard = Board & BoardData

function seedBoard(name: string, withCards: boolean): DemoBoard {
  const columns: Column[] = defaultColumns.map((column, index) => ({ id: demoId('col'), title: column.title, color: column.color, position: (index + 1) * STEP }))
  const day = (offset: number) => toISODate(addDays(new Date(), offset))
  const task = (title: string, done = false): Task => ({ id: demoId('task'), title, done, elapsedSeconds: 0, timerStartedAt: null })
  const base = { description: '', labels: [], dueStart: '' }
  const cards: Card[] = !withCards ? [] : [
    { ...base, id: demoId('card'), column: columns[0].id, position: 1000, title: 'Prova de Banco de Dados', description: 'Revisar normalização, SQL e transações.', discipline: 'Banco de Dados', type: 'prova', priority: 'alta', due: day(6), tasks: [task('Revisar material'), task('Resolver exercícios')] },
    { ...base, id: demoId('card'), column: columns[0].id, position: 2000, title: 'Lista de exercícios 3', discipline: 'Estruturas de Dados', type: 'exercicios', priority: 'media', due: day(-1), tasks: [] },
    { ...base, id: demoId('card'), column: columns[0].id, position: 3000, title: 'Ler capítulo 4', discipline: 'Metodologia', type: 'leitura', priority: 'baixa', due: '', tasks: [] },
    { ...base, id: demoId('card'), column: columns[1].id, position: 1000, title: 'Trabalho de Compiladores', description: 'Implementar o analisador léxico e entregar o relatório.', discipline: 'Compiladores', type: 'trabalho', priority: 'urgente', due: day(1), tasks: [task('Definir gramática', true), task('Implementar lexer', true), task('Escrever relatório')] },
    { ...base, id: demoId('card'), column: columns[1].id, position: 2000, title: 'Projeto integrador: protótipo', discipline: 'Engenharia de Software', type: 'projeto', priority: 'alta', dueStart: day(2), due: day(12), tasks: [task('Wireframes', true), task('Tela de login'), task('Apresentação')] },
    { ...base, id: demoId('card'), column: columns[2].id, position: 1000, title: 'Seminário de IA', description: 'Preparar apresentação sobre redes neurais.', discipline: 'Inteligência Artificial', type: 'seminario', priority: 'media', due: day(4), tasks: [task('Escolher referências', true), task('Montar slides')] },
    { ...base, id: demoId('card'), column: columns[3].id, position: 1000, title: 'Ler artigo científico', discipline: 'Metodologia', type: 'leitura', priority: 'baixa', due: day(-3), tasks: [task('Fazer anotações', true)] },
  ]
  return { id: demoId('board'), name, columns, cards }
}

/** Backend em memória para desenvolvimento e testes. Nada é persistido. */
export function createDemoApi(options: { empty?: boolean } = {}): Api {
  const boards: DemoBoard[] = [seedBoard('Demandas do semestre', !options.empty)]
  const find = (id: string) => {
    const board = boards.find((item) => item.id === id)
    if (!board) throw new Error('Quadro não encontrado')
    return board
  }
  const findCard = (id: string) => {
    for (const board of boards) {
      const card = board.cards.find((item) => item.id === id)
      if (card) return { board, card }
    }
    throw new Error('Demanda não encontrada')
  }
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  return {
    async listBoards() { return boards.map(({ id, name }) => ({ id, name })) },
    async createBoard(name) { const board = seedBoard(name, false); boards.push(board); return { id: board.id, name } },
    async renameBoard(id, name) { find(id).name = name },
    async deleteBoard(id) { boards.splice(boards.findIndex((item) => item.id === id), 1) },
    async loadBoard(id) { const board = find(id); return clone({ columns: [...board.columns].sort(byPosition), cards: [...board.cards].sort(byPosition) }) },
    async createColumn(boardId, title, color, position) { const column = { id: demoId('col'), title, color, position }; find(boardId).columns.push(column); return { ...column } },
    async updateColumn(id, patch) { for (const board of boards) { const column = board.columns.find((item) => item.id === id); if (column) Object.assign(column, patch) } },
    async reorderColumns(boardId, orderedIds) { find(boardId).columns.forEach((column) => { column.position = (orderedIds.indexOf(column.id) + 1) * STEP }) },
    async deleteColumn(id) { for (const board of boards) { board.columns = board.columns.filter((item) => item.id !== id); board.cards = board.cards.filter((item) => item.column !== id) } },
    async createCard(boardId, input) { const card: Card = clone({ ...input, id: demoId('card') }); find(boardId).cards.push(card); return clone(card) },
    async updateCard(id, patch) { Object.assign(findCard(id).card, patch) },
    async saveTasks(cardId, tasks) { findCard(cardId).card.tasks = clone(tasks) },
    async deleteCard(id) { const { board } = findCard(id); board.cards = board.cards.filter((item) => item.id !== id) },
    async deleteAccount() { throw new Error('Indisponível no modo demonstração') },
  }
}
