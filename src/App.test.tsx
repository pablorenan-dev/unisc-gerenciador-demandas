import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// jsdom não decodifica imagens: o preparo (redução/WebP) é simulado; o resto do fluxo é real.
vi.mock('./lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/images')>()),
  prepareImage: vi.fn(async () => ({ blob: new Blob(['imagem'], { type: 'image/webp' }), width: 800, height: 600, extension: 'webp' as const })),
}))
import App from './App'
import { pomodoro } from './state/pomodoro'
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

    await user.type(within(dialog).getByLabelText('Descrição'), ' Cai na prova.')
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

  it('cadastra uma disciplina com ícone sugerido e usa em uma demanda', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /quadro atual/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Disciplinas deste quadro' }))
    const manager = await screen.findByRole('dialog', { name: 'Disciplinas' })
    expect(within(manager).getByText('Banco de Dados')).toBeInTheDocument()
    await user.click(within(manager).getByRole('button', { name: /nova disciplina/i }))
    await user.type(within(manager).getByLabelText('Nome da disciplina'), 'Redes de Computadores')
    expect(within(manager).getByRole('radio', { name: 'Redes' })).toBeChecked()
    await user.click(within(manager).getByRole('button', { name: 'Criar disciplina' }))
    expect(await within(manager).findByText('Redes de Computadores')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.keyboard('n')
    const dialog = await screen.findByRole('dialog', { name: 'O que precisa ser feito?' })
    await user.type(within(dialog).getByLabelText('Título'), 'Lista de sub-redes')
    await user.selectOptions(within(dialog).getByLabelText(/Disciplina/), 'Redes de Computadores')
    await user.click(within(dialog).getByRole('button', { name: 'Criar demanda' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(views().getByRole('link', { name: /kanban/i }))
    const card = (await screen.findByRole('heading', { level: 3, name: 'Lista de sub-redes' })).closest('article')!
    expect(within(card).getByText('Redes de Computadores')).toBeInTheDocument()
  })

  it('observação: escreve, cola uma imagem no meio e continua escrevendo abaixo', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.click(screen.getByRole('heading', { level: 3, name: 'Trabalho de Compiladores' }))
    const dialog = await screen.findByRole('dialog', { name: /Trabalho de Compiladores/ })
    expect(await within(dialog).findByText(/no máximo 5 páginas/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /escreva uma observação/i }))
    const first = within(dialog).getByRole('textbox', { name: 'Nova observação' })
    await user.type(first, 'Enunciado da questão 2:')
    const print = new File(['png'], 'print.png', { type: 'image/png' })
    fireEvent.paste(first, { clipboardData: { files: [print], items: [], types: ['Files'] } })
    const below = await within(dialog).findByRole('textbox', { name: 'Continuação do texto' })
    await waitFor(() => expect(within(dialog).queryByText('Enviando…')).not.toBeInTheDocument())
    await user.type(below, 'Resposta: usar autômato finito.')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar observação' }))

    const saved = (await within(dialog).findByText('Resposta: usar autômato finito.')).closest('li')!
    const before = within(saved).getByText('Enunciado da questão 2:')
    const picture = within(saved).getByRole('button', { name: 'Ampliar imagem' })
    const after = within(saved).getByText('Resposta: usar autômato finito.')
    expect(before.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(picture.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const card = screen.getByRole('heading', { level: 3, name: 'Trabalho de Compiladores' }).closest('article')!
    expect(within(card).getByLabelText('2 observações')).toBeInTheDocument()
  })

  it('fechar o card com observação escrita e não salva pede confirmação', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.click(screen.getByRole('heading', { level: 3, name: 'Seminário de IA' }))
    const dialog = await screen.findByRole('dialog', { name: /Seminário de IA/ })
    await user.click(within(dialog).getByRole('button', { name: /escreva uma observação/i }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Nova observação' }), 'Rascunho')
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
  })

  it('envia e remove a foto de perfil', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /conta de/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Configurações' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurações' })
    fireEvent.change(within(dialog).getByLabelText('Escolher foto de perfil'), { target: { files: [new File(['jpg'], 'eu.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('Foto de perfil atualizada.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }))
    expect(await screen.findByText('Foto removida.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /enviar foto/i })).toBeInTheDocument()
  })

  it('pomodoro: focar numa tarefa pelo plano soma o tempo no timer dela', async () => {
    const user = await open()
    await user.click(views().getByRole('link', { name: /foco/i }))
    expect(await screen.findByRole('region', { name: 'Pomodoro' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Focar 25 minutos em Trabalho de Compiladores' }))
    expect(screen.getByRole('button', { name: 'Em foco: Trabalho de Compiladores' })).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'Pomodoro' })).getByText(/Foco total/)).toBeInTheDocument()

    // 10 minutos depois, a pessoa para o foco: o tempo cumprido vai para a tarefa "Escrever relatório".
    const realNow = Date.now
    const start = realNow()
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => start + 10 * 60 * 1000)
    pomodoro.stop()
    spy.mockRestore()
    expect(await screen.findByText('10 min de foco somados à tarefa.')).toBeInTheDocument()

    await user.click(views().getByRole('link', { name: /kanban/i }))
    await user.click(screen.getByRole('heading', { level: 3, name: 'Trabalho de Compiladores' }))
    const dialog = await screen.findByRole('dialog', { name: /Trabalho de Compiladores/ })
    const row = within(dialog).getByText('Escrever relatório').closest('li')!
    expect(within(row).getByText('10:00')).toBeInTheDocument()
  })

  it('Telegram: conecta pelo link do bot e ajusta horário e antecedência', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /conta de/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Configurações' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurações' })
    await user.click(await within(dialog).findByRole('button', { name: 'Conectar Telegram' }))
    const openBot = await within(dialog).findByRole('link', { name: /abrir o bot/i })
    expect(openBot).toHaveAttribute('href', expect.stringMatching(/^https:\/\/t\.me\/UgdChiquinhoBot\?start=/))
    expect(openBot).toHaveAttribute('rel', 'noopener noreferrer')

    expect(await within(dialog).findByText(/Conectado como @visitante/, {}, { timeout: 8000 })).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Horário'), '7')
    await user.selectOptions(within(dialog).getByLabelText('Avisar com antecedência de'), '1')
    expect(within(dialog).getByLabelText('Horário')).toHaveValue('7')
    await user.click(within(dialog).getByRole('button', { name: 'Enviar resumo agora' }))
    expect(await screen.findByText('Resumo enviado. Confere no Telegram!')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }))
    expect(await within(dialog).findByRole('button', { name: 'Conectar Telegram' })).toBeInTheDocument()
  }, 15000)

  it('mostra estado vazio com o Chiquinho para quem acabou de chegar', async () => {
    await open('/', { empty: true })
    expect(await screen.findByRole('heading', { level: 1, name: /tudo vazio/i })).toBeInTheDocument()
  })

  it('tem página 404', async () => {
    render(<App api={createDemoApi()} initialPath="/nao-existe" />)
    expect(await screen.findByRole('heading', { name: /404/ })).toBeInTheDocument()
  })
})
