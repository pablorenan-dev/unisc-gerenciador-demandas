export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: { card_type: 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'outro'; priority: 'baixa' | 'media' | 'alta'; board_role: 'owner' | 'editor' | 'viewer' }
    CompositeTypes: Record<string, never>
  }
}
