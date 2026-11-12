import type { Discipline } from '../../lib/types'
import { DisciplineIcon } from './DisciplineIcon'

type Props = {
  disciplines: Discipline[]
  value: string | null
  /** Nome em texto de um card antigo, ainda sem disciplina cadastrada. */
  legacyName?: string
  onChange: (id: string | null) => void
  /** Abre o cadastro para criar uma disciplina nova. */
  onCreate: () => void
}

const NEW = '__nova__'

/** Escolha da disciplina do card, com atalho para cadastrar uma nova sem sair do formulário. */
export function DisciplineSelect({ disciplines, value, legacyName, onChange, onCreate }: Props) {
  const selected = disciplines.find((item) => item.id === value)
  return (
    <span className="disc-select">
      {selected && <DisciplineIcon icon={selected.icon} color={selected.color} size={30} />}
      <select className="select" value={selected ? selected.id : ''} onChange={(event) => (event.target.value === NEW ? onCreate() : onChange(event.target.value || null))}>
        <option value="">{!selected && legacyName ? `${legacyName} (sem cadastro)` : 'Sem disciplina'}</option>
        {disciplines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        <option value={NEW}>+ Nova disciplina…</option>
      </select>
    </span>
  )
}
