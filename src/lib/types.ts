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
  discipline: string
  type: CardType
  priority: Priority
  /** Datas no formato AAAA-MM-DD; string vazia significa "sem data". */
  dueStart: string
  due: string
  labels: string[]
  tasks: Task[]
}

export type Column = { id: string; title: string; color: string; position: number }
export type Board = { id: string; name: string }

export type CardInput = Omit<Card, 'id' | 'position'> & { position?: number }

export const TITLE_MAX = 200
export const COLUMN_TITLE_MAX = 80
export const BOARD_NAME_MAX = 120

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
