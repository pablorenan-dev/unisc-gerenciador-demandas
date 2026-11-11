export type Database = {
  public: {
    Tables: {
      boards: {
        Row: { id: string; owner_id: string; created_at: string }
        Insert: { owner_id: string; nome: string; descricao?: string }
        Update: Partial<{ owner_id: string; nome: string; descricao: string }>
        Relationships: []
      }
      columns: {
        Row: { id: string; board_id: string; nome: string; posicao: number; cor: string }
        Insert: { board_id: string; nome: string; posicao?: number; cor?: string }
        Update: Partial<{ board_id: string; nome: string; posicao: number; cor: string }>
        Relationships: []
      },
      cards: {
        Row: { id: string; board_id: string; column_id: string; titulo: string; descricao: string; disciplina: string; tipo: 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'outro'; prioridade: 'baixa' | 'media' | 'alta'; data_entrega: string | null; labels: string[]; posicao: number }
        Insert: { board_id: string; column_id: string; titulo: string; descricao?: string; disciplina?: string; tipo?: 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'outro'; prioridade?: 'baixa' | 'media' | 'alta'; data_entrega?: string | null; labels?: string[]; posicao?: number }
        Update: Partial<{ board_id: string; column_id: string; titulo: string; descricao: string; disciplina: string; tipo: 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'outro'; prioridade: 'baixa' | 'media' | 'alta'; data_entrega: string | null; labels: string[]; posicao: number }>
        Relationships: []
      },
      tasks: {
        Row: { id: string; card_id: string; titulo: string; concluida: boolean }
        Insert: { card_id: string; titulo: string; concluida?: boolean }
        Update: Partial<{ card_id: string; titulo: string; concluida: boolean }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: { card_type: 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'outro'; priority: 'baixa' | 'media' | 'alta'; board_role: 'owner' | 'editor' | 'viewer' }
    CompositeTypes: Record<string, never>
  }
}
