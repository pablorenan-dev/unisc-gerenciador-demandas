import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, toISODate } from './dates'
import { byPosition, STEP } from './order'
import { AVATAR_PATH, CARD_IMAGE_PATH, parseBlocks, type StoredBlock } from './blocks'
import { safeIcon } from './disciplines'
import { defaultColumns, type Board, type Card, type CardInput, type Bucket, type CardType, type Column, type Discipline, type DisciplineInput, type Note, type Priority, type Profile, type Task, type TelegramSettings, type TelegramStatus } from './types'

export type CardPatch = Partial<Pick<Card, 'title' | 'description' | 'discipline' | 'disciplineId' | 'type' | 'priority' | 'dueStart' | 'due' | 'labels' | 'column' | 'position'>>
export type ColumnPatch = Partial<Pick<Column, 'title' | 'color' | 'position'>>
export type BoardData = {
  columns: Column[]
  cards: Card[]
  disciplines: Discipline[]
  /** Falso quando o banco ainda não tem a tabela de disciplinas (migration 0011 não aplicada). */
  disciplinesReady: boolean
  /** Falso quando o banco ainda não tem observações e imagens (migration 0012 não aplicada). */
  notesReady: boolean
}

export type UploadedImage = { blob: Blob; extension: 'webp' | 'jpg' }

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
  createDiscipline(boardId: string, input: DisciplineInput): Promise<Discipline>
  updateDiscipline(id: string, patch: Partial<DisciplineInput>): Promise<void>
  deleteDiscipline(id: string): Promise<void>
  /** `null` quando o perfil não está disponível (migration 0012 não aplicada). */
  getProfile(): Promise<Profile | null>
  /** Envia a nova foto, troca no perfil e apaga a anterior. Devolve o caminho no bucket. */
  setAvatar(image: UploadedImage): Promise<string>
  removeAvatar(): Promise<void>
  /** Links temporários para arquivos dos buckets privados. */
  signedUrls(bucket: Bucket, paths: string[]): Promise<Record<string, string>>
  uploadCardImage(boardId: string, cardId: string, image: UploadedImage): Promise<string>
  removeImages(bucket: Bucket, paths: string[]): Promise<void>
  listNotes(cardId: string): Promise<Note[]>
  createNote(cardId: string, content: StoredBlock[]): Promise<Note>
  updateNote(id: string, content: StoredBlock[]): Promise<Note>
  deleteNote(id: string): Promise<void>
  /** `null` quando o banco não tem os lembretes (migration 0013 não aplicada). */
  telegramStatus(): Promise<TelegramStatus | null>
  /** Link de uso único que abre o bot já com o código de conexão. */
  telegramConnect(): Promise<string>
  telegramUpdate(settings: TelegramSettings): Promise<void>
  telegramDisconnect(): Promise<void>
  telegramTest(): Promise<void>
  deleteAccount(): Promise<void>
}

/** Erros das funções do Telegram já vêm em português do banco; os demais viram uma frase genérica. */
export class TelegramError extends Error {}

type Result = { error: { message: string; code?: string } | null }

function check<T extends Result>(result: T): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code })
  return result
}

type TaskRow = { id: string; titulo: string; concluida: boolean; tempo_segundos: number | null; timer_iniciado_em: string | null; posicao: number | null; created_at?: string }
type CardRow = { id: string; column_id: string; posicao: number; titulo: string; descricao: string | null; disciplina: string | null; discipline_id?: string | null; notes?: { count: number }[]; tipo: CardType; prioridade: Priority; data_inicio: string | null; data_entrega: string | null; labels: string[] | null; created_at?: string; tasks?: TaskRow[] }
type ColumnRow = { id: string; nome: string; cor: string; posicao: number }
type DisciplineRow = { id: string; nome: string; icone: string; cor: string }
type NoteRow = { id: string; card_id: string; author_id: string; conteudo: unknown; created_at: string; updated_at: string }

const NOTE_FIELDS = 'id, card_id, author_id, conteudo, created_at, updated_at'
const SIGNED_URL_SECONDS = 3600

const toNote = (row: NoteRow): Note => ({ id: row.id, cardId: row.card_id, authorId: row.author_id, content: parseBlocks(row.conteudo), createdAt: row.created_at, updatedAt: row.updated_at })

/** Só caminhos no formato esperado de cada bucket chegam ao Storage. */
const validPath = (bucket: Bucket, path: string) => (bucket === 'avatars' ? AVATAR_PATH : CARD_IMAGE_PATH).test(path)

const DISCIPLINE_FIELDS = 'id, nome, icone, cor'

/** Erros do PostgREST/Postgres para tabela ou coluna que ainda não existe. */
const isMissingSchema = (error: { code?: string } | null) => Boolean(error && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? ''))
/** Tabela sem permissão para o usuário logado (ex.: profiles antes da 0012). */
const isUnavailable = (error: { code?: string } | null) => isMissingSchema(error) || error?.code === '42501'

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
    disciplineId: row.discipline_id ?? null,
    discipline: row.disciplina ?? '',
    type: row.tipo,
    priority: row.prioridade,
    dueStart: row.data_inicio ?? '',
    due: row.data_entrega ?? '',
    labels: row.labels ?? [],
    tasks: tasks.map(toTask),
    notesCount: row.notes?.[0]?.count ?? 0,
  }
}

/** A cor vai para um `style`; só aceitamos hexadecimal, venha de onde vier (banco ou tela). */
export function safeColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#a8a29e'
}

const toDiscipline = (row: DisciplineRow): Discipline => ({ id: row.id, name: row.nome, icon: safeIcon(row.icone), color: safeColor(row.cor) })

const toColumn = (row: ColumnRow): Column => ({ id: row.id, title: row.nome, color: safeColor(row.cor), position: row.posicao })

function cardPatchToRow(patch: CardPatch, withDisciplineId: boolean) {
  const row: Record<string, unknown> = {}
  if (withDisciplineId && patch.disciplineId !== undefined) row.discipline_id = patch.disciplineId
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
  // Descoberto em `loadBoard`: enquanto a migration 0011 não existir no banco, o app segue
  // funcionando com a disciplina em texto, sem enviar a coluna nova.
  let disciplinesReady = true
  let notesReady = true
  const cardFields = () => (disciplinesReady ? `${CARD_FIELDS}, discipline_id` : CARD_FIELDS)
  const storage = (bucket: Bucket) => client.storage.from(bucket)

  async function removePaths(bucket: Bucket, paths: string[]) {
    const valid = paths.filter((path) => validPath(bucket, path))
    for (let index = 0; index < valid.length; index += 100) {
      const { error } = await storage(bucket).remove(valid.slice(index, index + 100))
      if (error) throw error
    }
  }

  /** Apaga uma pasta inteira do bucket (até 2 níveis). Limpeza "melhor esforço": nunca impede a exclusão principal. */
  async function removeFolder(bucket: Bucket, prefix: string) {
    if (!notesReady) return
    try {
      const files: string[] = []
      const walk = async (folder: string, depth: number) => {
        const { data, error } = await storage(bucket).list(folder, { limit: 1000 })
        if (error) return
        for (const item of data ?? []) {
          const path = `${folder}/${item.name}`
          if (item.id) files.push(path)
          else if (depth < 2) await walk(path, depth + 1)
        }
      }
      await walk(prefix, 0)
      await removePaths(bucket, files)
    } catch { /* arquivos órfãos não afetam o uso; ver README */ }
  }

  async function upload(bucket: Bucket, path: string, image: UploadedImage) {
    const { error } = await storage(bucket).upload(path, image.blob, { contentType: image.extension === 'jpg' ? 'image/jpeg' : 'image/webp', cacheControl: '3600', upsert: false })
    if (error) throw error
    return path
  }

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
      await removeFolder('card-images', id)
      check(await client.from('boards').delete().eq('id', id))
    },

    async loadBoard(id) {
      let { data: columnRows } = check(await client.from('columns').select('id, nome, cor, posicao').eq('board_id', id).order('posicao', { ascending: true }))
      if (!columnRows?.length) {
        const created = check(await client.from('columns').insert(defaultColumns.map((column, index) => ({ board_id: id, nome: column.title, cor: column.color, posicao: (index + 1) * STEP }))).select('id, nome, cor, posicao'))
        columnRows = created.data
      }
      const found = await client.from('disciplines').select(DISCIPLINE_FIELDS).eq('board_id', id).order('nome', { ascending: true })
      disciplinesReady = !isMissingSchema(found.error)
      if (disciplinesReady) check(found)
      const disciplines = disciplinesReady ? ((found.data ?? []) as DisciplineRow[]).map(toDiscipline) : []

      const probe = await client.from('notes').select('id').limit(0)
      notesReady = !isMissingSchema(probe.error)

      const { data: cardRows } = check(await client.from('cards').select(`${cardFields()}, tasks(${TASK_FIELDS})${notesReady ? ', notes(count)' : ''}`).eq('board_id', id).order('posicao', { ascending: true }).order('created_at', { ascending: true }))
      return {
        columns: ((columnRows ?? []) as ColumnRow[]).map(toColumn),
        cards: ((cardRows ?? []) as unknown as CardRow[]).map(toCard),
        disciplines,
        disciplinesReady,
        notesReady,
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
      const { data } = check(await client.from('cards').delete().eq('column_id', id).select('id, board_id'))
      check(await client.from('columns').delete().eq('id', id))
      for (const card of (data ?? []) as { id: string; board_id: string }[]) await removeFolder('card-images', `${card.board_id}/${card.id}`)
    },

    async createCard(boardId, input) {
      const { data } = check(await client.from('cards').insert({ board_id: boardId, ...cardPatchToRow(input, disciplinesReady) }).select(cardFields()).single())
      const card = toCard(data as unknown as CardRow)
      if (input.tasks.length) check(await client.from('tasks').insert(input.tasks.map(taskToRow(card.id))))
      return { ...card, tasks: input.tasks, notesCount: 0 }
    },

    async updateCard(id, patch) {
      check(await client.from('cards').update(cardPatchToRow(patch, disciplinesReady)).eq('id', id))
    },

    async saveTasks(cardId, tasks, removedIds) {
      // Grava primeiro, apaga depois: uma falha no meio nunca deixa o card sem tarefas.
      if (tasks.length) check(await client.from('tasks').upsert(tasks.map(taskToRow(cardId)), { onConflict: 'id' }))
      if (removedIds.length) check(await client.from('tasks').delete().in('id', removedIds).eq('card_id', cardId))
    },

    async deleteCard(id) {
      const { data } = check(await client.from('cards').delete().eq('id', id).select('board_id'))
      const boardId = (data as { board_id: string }[] | null)?.[0]?.board_id
      if (boardId) await removeFolder('card-images', `${boardId}/${id}`)
    },

    async createDiscipline(boardId, input) {
      const { data } = check(await client.from('disciplines').insert({ board_id: boardId, nome: input.name, icone: safeIcon(input.icon), cor: safeColor(input.color) }).select(DISCIPLINE_FIELDS).single())
      return toDiscipline(data as DisciplineRow)
    },

    async updateDiscipline(id, patch) {
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) row.nome = patch.name
      if (patch.icon !== undefined) row.icone = safeIcon(patch.icon)
      if (patch.color !== undefined) row.cor = safeColor(patch.color)
      check(await client.from('disciplines').update(row).eq('id', id))
      // O nome também fica copiado no card (coluna de texto antiga); mantém a cópia em dia.
      if (patch.name !== undefined) check(await client.from('cards').update({ disciplina: patch.name }).eq('discipline_id', id))
    },

    async deleteDiscipline(id) {
      check(await client.from('cards').update({ disciplina: '' }).eq('discipline_id', id))
      check(await client.from('disciplines').delete().eq('id', id))
    },

    async getProfile() {
      const { data, error } = await client.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
      if (isUnavailable(error)) return null
      if (error) throw error
      const path = (data as { avatar_url: string | null } | null)?.avatar_url ?? null
      return { avatarPath: path && AVATAR_PATH.test(path) ? path : null }
    },

    async setAvatar(image) {
      const previous = (await this.getProfile())?.avatarPath ?? null
      const path = await upload('avatars', `${userId}/${crypto.randomUUID()}.${image.extension}`, image)
      const { error } = await client.from('profiles').upsert({ id: userId, avatar_url: path }, { onConflict: 'id' })
      if (error) {
        await removePaths('avatars', [path]).catch(() => {})
        throw error
      }
      if (previous) await removePaths('avatars', [previous]).catch(() => {})
      return path
    },

    async removeAvatar() {
      const previous = (await this.getProfile())?.avatarPath ?? null
      check(await client.from('profiles').upsert({ id: userId, avatar_url: null }, { onConflict: 'id' }))
      if (previous) await removePaths('avatars', [previous]).catch(() => {})
    },

    async signedUrls(bucket, paths) {
      const valid = [...new Set(paths)].filter((path) => validPath(bucket, path))
      if (!valid.length) return {}
      const { data, error } = await storage(bucket).createSignedUrls(valid, SIGNED_URL_SECONDS)
      if (error) throw error
      const urls: Record<string, string> = {}
      for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl
      return urls
    },

    async uploadCardImage(boardId, cardId, image) {
      return upload('card-images', `${boardId}/${cardId}/${crypto.randomUUID()}.${image.extension}`, image)
    },

    async removeImages(bucket, paths) {
      await removePaths(bucket, paths)
    },

    async listNotes(cardId) {
      const { data } = check(await client.from('notes').select(NOTE_FIELDS).eq('card_id', cardId).order('created_at', { ascending: false }))
      return ((data ?? []) as NoteRow[]).map(toNote)
    },

    async createNote(cardId, content) {
      const { data } = check(await client.from('notes').insert({ card_id: cardId, conteudo: content }).select(NOTE_FIELDS).single())
      return toNote(data as NoteRow)
    },

    async updateNote(id, content) {
      const { data } = check(await client.from('notes').update({ conteudo: content }).eq('id', id).select(NOTE_FIELDS).single())
      return toNote(data as NoteRow)
    },

    async deleteNote(id) {
      check(await client.from('notes').delete().eq('id', id))
    },

    async telegramStatus() {
      const { data, error } = await client.rpc('telegram_status')
      if (error && ['PGRST202', '42883'].includes(error.code ?? '')) return null
      if (error) throw error
      const value = data as Partial<TelegramStatus>
      return {
        configured: Boolean(value.configured), linked: Boolean(value.linked), username: value.username ?? null, firstName: value.firstName ?? null,
        enabled: value.enabled !== false, remindHour: Number(value.remindHour ?? 19), daysAhead: Number(value.daysAhead ?? 2), timezone: String(value.timezone ?? 'America/Sao_Paulo'),
      }
    },

    async telegramConnect() {
      const { data, error } = await client.rpc('telegram_connect')
      if (error) throw new TelegramError(error.code === 'P0001' ? error.message : 'Não foi possível gerar o link de conexão.')
      const url = (data as { url?: string } | null)?.url ?? ''
      if (!/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=[a-f0-9]{32}$/.test(url)) throw new TelegramError('O link de conexão veio num formato inesperado.')
      return url
    },

    async telegramUpdate(settings) {
      const { error } = await client.rpc('telegram_update_settings', { p_enabled: settings.enabled, p_remind_hour: settings.remindHour, p_days_ahead: settings.daysAhead, p_timezone: settings.timezone })
      if (error) throw new TelegramError(error.code === '22023' ? error.message : 'Não foi possível salvar os lembretes.')
    },

    async telegramDisconnect() {
      const { error } = await client.rpc('telegram_disconnect')
      if (error) throw new TelegramError('Não foi possível desconectar o Telegram.')
    },

    async telegramTest() {
      const { error } = await client.rpc('telegram_send_test')
      if (error) throw new TelegramError(['P0002', 'P0003'].includes(error.code ?? '') ? error.message : 'Não foi possível enviar a mensagem de teste.')
    },

    async deleteAccount() {
      // Apaga os arquivos antes: depois que a conta some, as policies do Storage não deixam mais.
      const { data } = await client.from('boards').select('id').eq('owner_id', userId)
      for (const board of (data ?? []) as { id: string }[]) await removeFolder('card-images', board.id)
      await removeFolder('avatars', userId)
      check(await client.rpc('delete_my_account'))
    },
  }
}

/* ------------------------------ Modo demonstração ------------------------------ */

let demoCounter = 0
const demoId = (prefix: string) => `${prefix}-${(demoCounter += 1)}`

type DemoBoard = Board & Omit<BoardData, 'disciplinesReady' | 'notesReady'>

/** Ids no formato uuid (as pastas de imagem usam o id), mas estáveis entre recargas do modo demo. */
let demoUuidCounter = 0
const demoUuid = () => `00000000-0000-4000-8000-${String((demoUuidCounter += 1)).padStart(12, '0')}`

function seedBoard(name: string, withCards: boolean): DemoBoard {
  const columns: Column[] = defaultColumns.map((column, index) => ({ id: demoId('col'), title: column.title, color: column.color, position: (index + 1) * STEP }))
  const day = (offset: number) => toISODate(addDays(new Date(), offset))
  const task = (title: string, done = false): Task => ({ id: demoId('task'), title, done, elapsedSeconds: 0, timerStartedAt: null })
  const names: [string, Discipline['icon'], string][] = [['Banco de Dados', 'database', '#3b82f6'], ['Estruturas de Dados', 'puzzle', '#b7c95a'], ['Metodologia', 'graduation', '#a8a29e'], ['Compiladores', 'braces', '#f5a524'], ['Engenharia de Software', 'layers', '#a78bfa'], ['Inteligência Artificial', 'brain', '#ec4899']]
  const disciplines: Discipline[] = !withCards ? [] : names.map(([name, icon, color]) => ({ id: demoId('disc'), name, icon, color }))
  const base = { description: '', labels: [], dueStart: '', disciplineId: null as string | null, notesCount: 0 }
  const cards: Card[] = !withCards ? [] : [
    { ...base, id: demoUuid(), column: columns[0].id, position: 1000, title: 'Prova de Banco de Dados', description: 'Revisar normalização, SQL e transações.', discipline: 'Banco de Dados', type: 'prova', priority: 'alta', due: day(6), tasks: [task('Revisar material'), task('Resolver exercícios')] },
    { ...base, id: demoUuid(), column: columns[0].id, position: 2000, title: 'Lista de exercícios 3', discipline: 'Estruturas de Dados', type: 'exercicios', priority: 'media', due: day(-1), tasks: [] },
    { ...base, id: demoUuid(), column: columns[0].id, position: 3000, title: 'Ler capítulo 4', discipline: 'Metodologia', type: 'leitura', priority: 'baixa', due: '', tasks: [] },
    { ...base, id: demoUuid(), column: columns[1].id, position: 1000, title: 'Trabalho de Compiladores', description: 'Implementar o analisador léxico e entregar o relatório.', discipline: 'Compiladores', type: 'trabalho', priority: 'urgente', due: day(1), tasks: [task('Definir gramática', true), task('Implementar lexer', true), task('Escrever relatório')] },
    { ...base, id: demoUuid(), column: columns[1].id, position: 2000, title: 'Projeto integrador: protótipo', discipline: 'Engenharia de Software', type: 'projeto', priority: 'alta', dueStart: day(2), due: day(12), tasks: [task('Wireframes', true), task('Tela de login'), task('Apresentação')] },
    { ...base, id: demoUuid(), column: columns[2].id, position: 1000, title: 'Seminário de IA', description: 'Preparar apresentação sobre redes neurais.', discipline: 'Inteligência Artificial', type: 'seminario', priority: 'media', due: day(4), tasks: [task('Escolher referências', true), task('Montar slides')] },
    { ...base, id: demoUuid(), column: columns[3].id, position: 1000, title: 'Ler artigo científico', discipline: 'Metodologia', type: 'leitura', priority: 'baixa', due: day(-3), tasks: [task('Fazer anotações', true)] },
  ]
  cards.forEach((card) => { card.disciplineId = disciplines.find((item) => item.name === card.discipline)?.id ?? null })
  if (withCards) cards[3].notesCount = 1
  return { id: demoUuid(), name, columns, cards, disciplines }
}

/** Backend em memória para desenvolvimento e testes. Nada é persistido. */
export function createDemoApi(options: { empty?: boolean } = {}): Api {
  const boards: DemoBoard[] = [seedBoard('Demandas do semestre', !options.empty)]
  // Arquivos "enviados" ficam só na memória do navegador.
  const files = new Map<string, string>()
  let avatarPath: string | null = null
  let telegram: TelegramStatus = { configured: true, linked: false, username: null, firstName: null, enabled: true, remindHour: 19, daysAhead: 2, timezone: 'America/Sao_Paulo' }
  const notes: Note[] = []
  if (!options.empty) {
    const compiladores = boards[0].cards[3]
    const when = new Date(Date.now() - 26 * 3600 * 1000).toISOString()
    notes.push({ id: demoUuid(), cardId: compiladores.id, authorId: 'demo', createdAt: when, updatedAt: when, content: [{ type: 'text', text: 'O professor disse que o relatório pode ter no máximo 5 páginas.\nUsar o modelo da ABNT que está no Moodle.' }] })
  }
  const store = (path: string, blob: Blob) => {
    files.set(path, typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '')
    return path
  }
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
    async loadBoard(id) { const board = find(id); return clone({ columns: [...board.columns].sort(byPosition), cards: [...board.cards].sort(byPosition), disciplines: board.disciplines, disciplinesReady: true, notesReady: true }) },
    async createColumn(boardId, title, color, position) { const column = { id: demoId('col'), title, color, position }; find(boardId).columns.push(column); return { ...column } },
    async updateColumn(id, patch) { for (const board of boards) { const column = board.columns.find((item) => item.id === id); if (column) Object.assign(column, patch) } },
    async reorderColumns(boardId, orderedIds) { find(boardId).columns.forEach((column) => { column.position = (orderedIds.indexOf(column.id) + 1) * STEP }) },
    async deleteColumn(id) { for (const board of boards) { board.columns = board.columns.filter((item) => item.id !== id); board.cards = board.cards.filter((item) => item.column !== id) } },
    async createCard(boardId, input) { const card: Card = clone({ ...input, id: demoUuid(), notesCount: 0 }); find(boardId).cards.push(card); return clone(card) },
    async updateCard(id, patch) { Object.assign(findCard(id).card, patch) },
    async saveTasks(cardId, tasks) { findCard(cardId).card.tasks = clone(tasks) },
    async deleteCard(id) { const { board } = findCard(id); board.cards = board.cards.filter((item) => item.id !== id) },
    async createDiscipline(boardId, input) { const discipline = { ...input, id: demoId('disc') }; find(boardId).disciplines.push(discipline); return { ...discipline } },
    async updateDiscipline(id, patch) { for (const board of boards) { const discipline = board.disciplines.find((item) => item.id === id); if (discipline) Object.assign(discipline, patch) } },
    async deleteDiscipline(id) { for (const board of boards) { board.disciplines = board.disciplines.filter((item) => item.id !== id); board.cards.forEach((card) => { if (card.disciplineId === id) { card.disciplineId = null; card.discipline = '' } }) } },
    async getProfile() { return { avatarPath } },
    async setAvatar(image) { avatarPath = store(`${demoUuid()}/${demoUuid()}.${image.extension}`, image.blob); return avatarPath },
    async removeAvatar() { avatarPath = null },
    async signedUrls(_bucket, paths) { return Object.fromEntries(paths.filter((path) => files.get(path)).map((path) => [path, files.get(path) as string])) },
    async uploadCardImage(boardId, cardId, image) { return store(`${boardId}/${cardId}/${demoUuid()}.${image.extension}`, image.blob) },
    async removeImages(_bucket, paths) { paths.forEach((path) => files.delete(path)) },
    async listNotes(cardId) { return clone(notes.filter((note) => note.cardId === cardId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) },
    async createNote(cardId, content) {
      const now = new Date().toISOString()
      const note: Note = { id: demoUuid(), cardId, authorId: 'demo', content: clone(content), createdAt: now, updatedAt: now }
      notes.push(note)
      return clone(note)
    },
    async updateNote(id, content) {
      const note = notes.find((item) => item.id === id)
      if (!note) throw new Error('Observação não encontrada')
      Object.assign(note, { content: clone(content), updatedAt: new Date().toISOString() })
      return clone(note)
    },
    async deleteNote(id) { notes.splice(notes.findIndex((item) => item.id === id), 1) },
    async telegramStatus() { return { ...telegram } },
    async telegramConnect() {
      // No modo demo, a conta "conecta" sozinha alguns segundos depois de abrir o link.
      window.setTimeout(() => { telegram = { ...telegram, linked: true, username: 'visitante', firstName: 'Visitante' } }, 2500)
      return 'https://t.me/UgdChiquinhoBot?start=00000000000000000000000000000000'
    },
    async telegramUpdate(settings) { telegram = { ...telegram, ...settings } },
    async telegramDisconnect() { telegram = { ...telegram, linked: false, username: null, firstName: null } },
    async telegramTest() { if (!telegram.linked) throw new TelegramError('Telegram não conectado') },
    async deleteAccount() { throw new Error('Indisponível no modo demonstração') },
  }
}
