import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, DndContext, DragOverlay, getFirstCollision, KeyboardSensor, MouseSensor, pointerWithin, rectIntersection, TouchSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { countActiveFilters, isDone } from '../../lib/insights'
import { byPosition } from '../../lib/order'
import { COLUMN_TITLE_MAX, columnColors, TITLE_MAX, type Card, type Column, type Discipline } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { ConfirmDialog, PromptDialog } from '../../ui/Dialog'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu'
import type { BoardContext } from '../shell/BoardLayout'
import { CardTile } from './CardTile'

type Lists = Record<string, string[]>

export default function BoardView() {
  const { store, visibleCards, filters, clearFilters, openCard, openNew, disciplineById } = useOutletContext<BoardContext>()
  const { columns, cards } = store
  const [activeId, setActiveId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Lists | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'delete'; column: Column } | { kind: 'add' } | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // No toque, segurar ~0,2s inicia o arraste; um deslize rápido continua rolando o quadro.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    // Espaço pega/solta; Enter fica livre para abrir a demanda.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  )

  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const lists = useMemo<Lists>(() => {
    const result: Lists = {}
    columns.forEach((column) => { result[column.id] = [] })
    ;[...visibleCards].sort(byPosition).forEach((card) => result[card.column]?.push(card.id))
    return result
  }, [columns, visibleCards])
  const shown = preview ?? lists
  const containerOf = (source: Lists, id: string) => (id in source ? id : Object.keys(source).find((key) => source[key].includes(id)))

  // Colisão para várias colunas (padrão recomendado pelo dnd-kit): primeiro o que está sob o ponteiro;
  // se for uma coluna, escolhe o card mais próximo dentro dela. Logo após trocar de coluna o layout
  // muda, então mantemos o último alvo por um quadro para o card não ficar "pingando" entre colunas.
  const lastOver = useRef<UniqueIdentifier | null>(null)
  const justMoved = useRef(false)
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointer = pointerWithin(args)
    let overId = getFirstCollision(pointer.length ? pointer : rectIntersection(args), 'id')
    if (overId != null) {
      const items = shown[String(overId)]
      if (items?.length) {
        overId = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => container.id !== overId && items.includes(String(container.id))) })[0]?.id ?? overId
      }
      lastOver.current = overId
      return [{ id: overId }]
    }
    if (justMoved.current) lastOver.current = activeId
    return lastOver.current != null ? [{ id: lastOver.current }] : []
  }, [shown, activeId])
  useEffect(() => {
    const frame = requestAnimationFrame(() => { justMoved.current = false })
    return () => cancelAnimationFrame(frame)
  }, [preview])

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setPreview(lists)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    setPreview((current) => {
      if (!current) return current
      const id = String(active.id)
      const from = containerOf(current, id)
      const to = containerOf(current, String(over.id))
      if (!from || !to || from === to) return current
      justMoved.current = true
      const target = [...current[to]]
      const overIndex = target.indexOf(String(over.id))
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, id)
      return { ...current, [from]: current[from].filter((item) => item !== id), [to]: target }
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = preview
    setActiveId(null)
    setPreview(null)
    if (!over || !current) return
    const id = String(active.id)
    const to = containerOf(current, String(over.id))
    if (!to) return
    let items = current[to]
    const from = items.indexOf(id)
    const target = items.indexOf(String(over.id))
    if (from >= 0 && target >= 0 && from !== target) items = arrayMove(items, from, target)
    const beforeId = items[items.indexOf(id) + 1] ?? null
    void store.moveCard(id, to, beforeId)
  }

  const activeCard = activeId ? byId.get(activeId) : undefined
  const filtering = countActiveFilters(filters) > 0
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? columns.find((column) => column.id === id)?.title ?? ''

  return (
    <div className="board-wrap">
      {cards.length === 0 && (
        <div className="callout">
          <Chiquinho mood="sleepy" size={64} />
          <div><strong>Quadro vazio. Dá até sono.</strong><p>Crie a primeira demanda: um trabalho, uma prova, uma leitura. Eu cuido de lembrar dos prazos.</p></div>
          <button type="button" className="btn btn--primary" onClick={() => openNew()}><Plus size={18} aria-hidden /> Nova demanda</button>
        </div>
      )}
      {cards.length > 0 && filtering && visibleCards.length === 0 && (
        <div className="callout">
          <Chiquinho mood="curious" size={64} />
          <div><strong>Procurei em tudo e não achei.</strong><p>Nenhuma demanda combina com a busca e os filtros atuais.</p></div>
          <button type="button" className="btn" onClick={clearFilters}>Limpar filtros</button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setPreview(null) }}
        accessibility={{
          screenReaderInstructions: { draggable: 'Pressione Espaço para pegar a demanda, use as setas para mover e Espaço de novo para soltar. Esc cancela. Enter abre a demanda.' },
          announcements: {
            onDragStart: ({ active }) => `Pegou a demanda ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} está sobre ${titleOf(over.id)}.` : undefined),
            onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} foi solta em ${titleOf(over.id)}.` : `${titleOf(active.id)} voltou ao lugar.`),
            onDragCancel: ({ active }) => `Movimento cancelado. ${titleOf(active.id)} voltou ao lugar.`,
          },
        }}>
        <div className="board" role="list" aria-label="Colunas do quadro">
          {columns.map((column, index) => (
            <ColumnView key={column.id} column={column} index={index} total={columns.length} ids={shown[column.id] ?? []} byId={byId} disciplineById={disciplineById} columns={columns} dragging={Boolean(activeId)}
              countAll={filtering ? cards.filter((card) => card.column === column.id).length : (shown[column.id] ?? []).length}
              onOpen={openCard}
              onQuickAdd={(title) => store.addCard({ title, column: column.id })}
              onMove={(id, to) => void store.moveCard(id, to, null)}
              onDuplicate={(id) => void store.duplicateCard(id)}
              onDelete={(id) => store.deleteCard(id)}
              onRename={() => setDialog({ kind: 'rename', column })}
              onRemove={() => setDialog({ kind: 'delete', column })}
              onColor={(color) => void store.updateColumn(column.id, { color })}
              onShift={(direction) => void store.shiftColumn(column.id, direction)} />
          ))}
          <button type="button" className="add-column" onClick={() => setDialog({ kind: 'add' })}><Plus size={18} aria-hidden /> Adicionar coluna</button>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {activeCard && <article className="card card--overlay"><CardTile card={activeCard} done={isDone(activeCard, columns)} discipline={disciplineById.get(activeCard.disciplineId ?? '')} /></article>}
        </DragOverlay>
      </DndContext>

      {dialog?.kind === 'add' && <PromptDialog title="Nova coluna" label="Nome da coluna" maxLength={COLUMN_TITLE_MAX} confirmLabel="Criar coluna" placeholder="Ex.: Aguardando o grupo" onClose={() => setDialog(null)} onSubmit={(title) => void store.addColumn(title)} />}
      {dialog?.kind === 'rename' && <PromptDialog title="Renomear coluna" label="Nome da coluna" initial={dialog.column.title} maxLength={COLUMN_TITLE_MAX} confirmLabel="Salvar" onClose={() => setDialog(null)} onSubmit={(title) => void store.updateColumn(dialog.column.id, { title })} />}
      {dialog?.kind === 'delete' && (() => {
        const count = cards.filter((card) => card.column === dialog.column.id).length
        return <ConfirmDialog danger title={`Excluir "${dialog.column.title}"?`} confirmLabel="Excluir coluna" onClose={() => setDialog(null)} onConfirm={() => void store.deleteColumn(dialog.column.id)}
          text={count ? `Isso também exclui ${count} ${count === 1 ? 'demanda' : 'demandas'} e suas tarefas. Não dá para desfazer.` : 'A coluna está vazia. Não dá para desfazer.'} />
      })()}
    </div>
  )
}

type ColumnProps = {
  column: Column
  index: number
  total: number
  ids: string[]
  byId: Map<string, Card>
  disciplineById: Map<string, Discipline>
  columns: Column[]
  dragging: boolean
  countAll: number
  onOpen: (id: string) => void
  onQuickAdd: (title: string) => Promise<Card | null>
  onMove: (id: string, column: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onRename: () => void
  onRemove: () => void
  onColor: (color: string) => void
  onShift: (direction: -1 | 1) => void
}

function ColumnView({ column, index, total, ids, byId, disciplineById, columns, dragging, countAll, onOpen, onQuickAdd, onMove, onDuplicate, onDelete, onRename, onRemove, onColor, onShift }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  async function submit() {
    if (!title.trim() || busy) return
    setBusy(true)
    const created = await onQuickAdd(title)
    setBusy(false)
    if (created) { setTitle(''); input.current?.focus() }
  }

  return (
    <section className={`column ${isOver && dragging ? 'column--over' : ''}`} role="listitem" aria-label={`${column.title}, ${ids.length} ${ids.length === 1 ? 'demanda' : 'demandas'}`}>
      <header className="column__header">
        <span className="column__dot" style={{ background: column.color }} aria-hidden />
        <h2 className="column__title">{column.title}</h2>
        <span className="column__count" title={ids.length !== countAll ? `${ids.length} visíveis de ${countAll}` : undefined}>{ids.length !== countAll ? `${ids.length}/${countAll}` : countAll}</span>
        <Menu label={`Opções da coluna ${column.title}`} trigger={<MoreHorizontal size={18} aria-hidden />} triggerClassName="icon-btn icon-btn--sm">
          {(close) => <>
            <MenuItem icon={<Pencil size={16} />} onSelect={() => { close(); onRename() }}>Renomear</MenuItem>
            <MenuItem icon={<ArrowLeft size={16} />} disabled={index === 0} onSelect={() => { close(); onShift(-1) }}>Mover para a esquerda</MenuItem>
            <MenuItem icon={<ArrowRight size={16} />} disabled={index === total - 1} onSelect={() => { close(); onShift(1) }}>Mover para a direita</MenuItem>
            <MenuSeparator />
            <MenuLabel>Cor</MenuLabel>
            <div className="swatches">
              {columnColors.map((color) => (
                <button key={color} type="button" role="menuitemradio" aria-checked={column.color === color} aria-label={`Cor ${color}`} className="swatch" style={{ background: color }} onClick={() => { onColor(color); close() }} />
              ))}
            </div>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 size={16} />} disabled={total <= 1} onSelect={() => { close(); onRemove() }}>Excluir coluna</MenuItem>
          </>}
        </Menu>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column__cards">
          {ids.map((id) => {
            const card = byId.get(id)
            return card ? <SortableCard key={id} card={card} discipline={disciplineById.get(card.disciplineId ?? '')} columns={columns} onOpen={() => onOpen(id)} onMove={(to) => onMove(id, to)} onDuplicate={() => onDuplicate(id)} onDelete={() => onDelete(id)} /> : null
          })}
          {ids.length === 0 && !adding && <p className="column__empty">{dragging ? 'Solte aqui' : 'Nada por aqui'}</p>}
        </div>
      </SortableContext>
      {adding ? (
        <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <textarea ref={input} className="input" rows={2} autoFocus maxLength={TITLE_MAX} placeholder="Título da demanda…" aria-label={`Título da nova demanda em ${column.title}`} value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
              if (event.key === 'Escape') { event.stopPropagation(); setAdding(false); setTitle('') }
            }} />
          <div className="quick-add__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={!title.trim() || busy}>Adicionar</button>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => { setAdding(false); setTitle('') }} aria-label="Cancelar"><X size={18} aria-hidden /></button>
          </div>
        </form>
      ) : (
        <button type="button" className="column__add" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> Adicionar demanda</button>
      )}
    </section>
  )
}

function SortableCard({ card, discipline, columns, onOpen, onMove, onDuplicate, onDelete }: { card: Card; discipline?: Discipline; columns: Column[]; onOpen: () => void; onMove: (column: string) => void; onDuplicate: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const done = isDone(card, columns)
  return (
    <article ref={setNodeRef} className={`card ${isDragging ? 'card--ghost' : ''} ${done ? 'card--done' : ''}`} style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes} {...listeners} aria-roledescription="demanda arrastável"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); onOpen(); return }
        listeners?.onKeyDown?.(event)
      }}>
      <CardTile card={card} done={done} discipline={discipline} columns={columns} onOpen={onOpen} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} />
    </article>
  )
}
