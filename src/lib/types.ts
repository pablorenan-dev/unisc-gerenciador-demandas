import type { StoredBlock } from './blocks'
import type { DisciplineIcon } from './disciplines'

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente' | 'critica'
export type CardType = 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'exercicios' | 'estudo' | 'outro'

export type Task = {
  id: string
  title: string
  done: boolean
  elapsedSeconds: number
  timerStartedAt: string | null
}

export type Card = {
  id: string
  column: string
  position: number
  title: string
  description: string
  /** Disciplina cadastrada no quadro (ou `null`). */
  disciplineId: string | null
  /** Nome da disciplina. Preenchido a partir do cadastro; em cards antigos pode ser texto livre. */
  discipline: string
  type: CardType
  priority: Priority
  /** Datas no formato AAAA-MM-DD; string vazia significa "sem data". */
  dueStart: string
  due: string
  labels: string[]
  tasks: Task[]
  /** Quantidade de observações (as observações em si são carregadas ao abrir o card). */
  notesCount: number
}

export type Note = { id: string; cardId: string; authorId: string; content: StoredBlock[]; createdAt: string; updatedAt: string }
export type Profile = { avatarPath: string | null }
export type Bucket = 'avatars' | 'card-images'

export type TelegramSettings = { enabled: boolean; remindHour: number; daysAhead: number; timezone: string }
export type TelegramStatus = TelegramSettings & { configured: boolean; linked: boolean; username: string | null; firstName: string | null }

export type Discipline = { id: string; name: string; icon: DisciplineIcon; color: string }
export type DisciplineInput = Omit<Discipline, 'id'>

export type Column = { id: string; title: string; color: string; position: number }
export type Board = { id: string; name: string }

export type CardInput = Omit<Card, 'id' | 'position'> & { position?: number }

export const TITLE_MAX = 200
export const COLUMN_TITLE_MAX = 80
export const BOARD_NAME_MAX = 120
export const DISCIPLINE_NAME_MAX = 120

export const typeLabels: Record<CardType, string> = {
  trabalho: 'Trabalho',
  prova: 'Prova',
  seminario: 'Seminário',
  leitura: 'Leitura',
  projeto: 'Projeto',
  exercicios: 'Exercícios',
  estudo: 'Estudo',
  outro: 'Outro',
}

export const priorityLabels: Record<Priority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
  critica: 'Crítica',
}

export const priorityOrder: Priority[] = ['critica', 'urgente', 'alta', 'media', 'baixa']

export const columnColors = ['#a8a29e', '#f5a524', '#f97316', '#ef6351', '#ec4899', '#a78bfa', '#6366f1', '#3b82f6', '#22b8cf', '#14b8a6', '#b7c95a', '#22c55e']

export const defaultColumns = [
  { title: 'A fazer', color: '#a8a29e' },
  { title: 'Em andamento', color: '#f5a524' },
  { title: 'Em revisão', color: '#a78bfa' },
  { title: 'Concluído', color: '#b7c95a' },
]
