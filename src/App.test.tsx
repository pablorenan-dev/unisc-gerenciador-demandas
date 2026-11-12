import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createDemoApi } from './lib/api'

async function open(path = '/', options: { empty?: boolean } = {}) {
  const user = userEvent.setup()
  render(<App api={createDemoApi(options)} initialPath={path} />)
  await screen.findByRole('navigation', { name: 'Visões do quadro' })
  return user
}

const views = () => within(screen.getByRole('navigation', { name: 'Visões do quadro' }))

describe('fluxos principais', () => {
  it('abre na visão geral com o resumo do que focar', async () => {
    await open()
    expect(await screen.findByRole('heading', { level: 1, name: /demanda atrasada/i })).toBeInTheDocument()
    expect(screen.getByText('Atrasadas e próximas entregas')).toBeInTheDocument()
  })

  it('cria uma demanda pelo diálogo, com Enter, e ela aparece no Kanban', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.keyboard('n')
    const dialog = await screen.findByRole('dialog', { name: 'O que precisa ser feito?' })
    await user.type(within(dialog).getByLabelText('Título'), 'Resenha de Sociologia{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 3, name: 'Resenha de Sociologia' })).toBeInTheDocument()
  })

  it('adiciona rápido pela coluna e move pelo menu (alternativa ao arraste)', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    const todo = screen.getByRole('listitem', { name: /^A fazer/ })
    await user.click(within(todo).getByRole('button', { name: /adicionar demanda/i }))
    await user.type(within(todo).getByRole('textbox'), 'Fichamento{Enter}')
    expect(await within(todo).findByText('Fichamento')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opções de Fichamento' }))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Concluído' }))
    const done = screen.getByRole('listitem', { name: /^Concluído/ })
    await waitFor(() => expect(within(done).getByText('Fichamento')).toBeInTheDocument())
    expect(within(todo).queryByText('Fichamento')).not.toBeInTheDocument()
  })

  it('edita no detalhe: marcar tarefa salva na hora; fechar com mudanças pede confirmação', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.click(screen.getByRole('heading', { level: 3, name: 'Prova de Banco de Dados' }))
    const dialog = await screen.findByRole('dialog', { name: /Prova de Banco de Dados/ })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Revisar material' }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Revisar material' })).toBeChecked())
    expect(within(dialog).getByText('1/2')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Disciplina'), ' II')
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
  })

  it('filtra pela busca e deixa claro como limpar', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.type(screen.getByRole('searchbox'), 'compiladores')
    expect(screen.queryByText('Seminário de IA')).not.toBeInTheDocument()
    expect(screen.getByText('Trabalho de Compiladores')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /limpar/i }))
    expect(screen.getByText('Seminário de IA')).toBeInTheDocument()
  })

  it('cria um quadro de verdade e entra nele', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /quadro atual/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Novo quadro' }))
    await user.type(screen.getByLabelText('Nome do quadro'), 'Demandas 2027/1{Enter}')
    expect(await screen.findByRole('button', { name: /Quadro atual: Demandas 2027\/1/ })).toBeInTheDocument()
    expect(await screen.findByText(/Quadro vazio/)).toBeInTheDocument()
  })

  it('no plano de foco, marcar o próximo passo como feito avança a demanda', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /foco/i }))
    expect(await screen.findByRole('heading', { level: 1, name: /plano/i })).toBeInTheDocument()
    const first = screen.getByRole('region', { name: /resolver primeiro/i })
    expect(within(first).getByText('Lista de exercícios 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar "Escrever relatório" como feito' }))
    await waitFor(() => expect(screen.queryByText('Trabalho de Compiladores')).not.toBeInTheDocument())
  })

  it('mostra estado vazio com o Chiquinho para quem acabou de chegar', async () => {
    await open('/', { empty: true })
    expect(await screen.findByRole('heading', { level: 1, name: /tudo vazio/i })).toBeInTheDocument()
  })

  it('tem página 404', async () => {
    render(<App api={createDemoApi()} initialPath="/nao-existe" />)
    expect(await screen.findByRole('heading', { name: /404/ })).toBeInTheDocument()
  })
})
