import { useMemo, useState, type RefObject } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { countActiveFilters, type Filters } from '../../lib/insights'
import { priorityLabels, priorityOrder, typeLabels, type Card, type CardType, type Priority } from '../../lib/types'

type Props = {
  filters: Filters
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  cards: Card[]
  shown: number
  searchRef: RefObject<HTMLInputElement | null>
}

/** Busca e filtros do quadro. Valem para o Kanban e o Calendário e ficam sempre visíveis quando ativos. */
export function FilterBar({ filters, setFilters, clearFilters, cards, shown, searchRef }: Props) {
  const [open, setOpen] = useState(false)
  const disciplines = useMemo(() => [...new Set(cards.map((card) => card.discipline).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [cards])
  const active = countActiveFilters(filters)
  const selects = active - Number(Boolean(filters.search.trim()))

  return (
    <div className="filterbar">
      <label className="search">
        <Search size={17} aria-hidden />
        <span className="sr-only">Buscar demandas</span>
        <input ref={searchRef} type="search" placeholder="Buscar demandas…  ( / )" value={filters.search} onChange={(event) => setFilters({ search: event.target.value })}
          onKeyDown={(event) => { if (event.key === 'Escape') { setFilters({ search: '' }); event.currentTarget.blur() } }} />
      </label>
      <button type="button" className={`btn filterbar__toggle ${selects ? 'btn--active' : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SlidersHorizontal size={17} aria-hidden /> Filtros{selects ? ` (${selects})` : ''}
      </button>
      <div className={`filterbar__selects ${open ? 'filterbar__selects--open' : ''}`}>
        <select className="select" aria-label="Situação" value={filters.status} onChange={(event) => setFilters({ status: event.target.value as Filters['status'] })}>
          <option value="all">Abertas e concluídas</option>
          <option value="open">Só abertas</option>
          <option value="done">Só concluídas</option>
        </select>
        <select className="select" aria-label="Prioridade" value={filters.priority} onChange={(event) => setFilters({ priority: event.target.value as 'all' | Priority })}>
          <option value="all">Toda prioridade</option>
          {priorityOrder.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}
        </select>
        <select className="select" aria-label="Tipo" value={filters.type} onChange={(event) => setFilters({ type: event.target.value as 'all' | CardType })}>
          <option value="all">Todo tipo</option>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {disciplines.length > 0 && (
          <select className="select" aria-label="Disciplina" value={filters.discipline} onChange={(event) => setFilters({ discipline: event.target.value })}>
            <option value="all">Toda disciplina</option>
            {disciplines.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
      </div>
      {active > 0 && (
        <button type="button" className="btn btn--ghost filterbar__clear" onClick={clearFilters}>
          <X size={16} aria-hidden /> Limpar <span className="filterbar__count">· {shown} de {cards.length}</span>
        </button>
      )}
    </div>
  )
}
