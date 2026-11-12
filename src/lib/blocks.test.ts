import { describe, expect, it } from 'vitest'
import { imagePaths, insertImagesAt, isBlank, normalize, parseBlocks, removeBlock, toEditorBlocks, toStoredBlocks, type EditorBlock } from './blocks'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const path = (n: number) => `${UUID_A}/${UUID_B}/3333333${n}-3333-4333-8333-333333333333.webp`
const image = (key: string, n = 1): EditorBlock => ({ key, type: 'image', path: path(n), preview: null, w: 800, h: 600, status: 'ready' })
const shape = (blocks: EditorBlock[]) => blocks.map((block) => (block.type === 'text' ? `t:${block.text}` : 'img'))

describe('blocos das observações', () => {
  it('cola a imagem no ponto do cursor: texto antes, imagem, texto depois', () => {
    const start = toEditorBlocks([{ type: 'text', text: 'Primeira linha\nSegunda linha' }])
    const result = insertImagesAt(start, [image('i1')], { key: start[0].key, position: 'Primeira linha\n'.length }, 'depois')
    expect(shape(result)).toEqual(['t:Primeira linha', 'img', 't:Segunda linha'])
    expect(result[2].key).toBe('depois')
  })

  it('sem cursor, a imagem vai para o fim e sempre sobra um texto para continuar escrevendo', () => {
    const result = insertImagesAt(toEditorBlocks([{ type: 'text', text: 'Oi' }]), [image('i1'), image('i2', 2)], null, 'fim')
    expect(shape(result)).toEqual(['t:Oi', 'img', 't:', 'img', 't:'])
  })

  it('mantém a forma texto/imagem/texto e une textos vizinhos ao remover uma imagem', () => {
    const blocks = normalize([image('a'), image('b', 2)])
    expect(shape(blocks)).toEqual(['t:', 'img', 't:', 'img', 't:'])
    const merged = removeBlock(insertImagesAt(toEditorBlocks([{ type: 'text', text: 'ab' }]), [image('i')], { key: 'b0', position: 1 }, 'x'), 'i')
    expect(shape(merged)).toEqual(['t:a\nb'])
  })

  it('ao salvar, descarta textos vazios e imagens que não terminaram de enviar', () => {
    const blocks: EditorBlock[] = [
      { key: 'a', type: 'text', text: '  ' },
      image('b'),
      { key: 'c', type: 'image', path: null, preview: 'blob:x', w: 0, h: 0, status: 'uploading' },
      { key: 'd', type: 'text', text: 'Fim  \n' },
    ]
    expect(toStoredBlocks(blocks)).toEqual([{ type: 'image', path: path(1), w: 800, h: 600 }, { type: 'text', text: 'Fim' }])
    expect(isBlank([{ type: 'text', text: ' \n ' }])).toBe(true)
  })

  it('o que vem do banco só vira imagem se for um arquivo do nosso bucket (sem links externos nem HTML)', () => {
    const parsed = parseBlocks([
      { type: 'text', text: '<img src=x onerror=alert(1)>' },
      { type: 'image', path: 'https://rastreador.exemplo/pixel.gif' },
      { type: 'image', path: `../${path(1)}` },
      { type: 'html', html: '<script>' },
      { type: 'image', path: path(2), w: 1200, h: 800 },
      'texto solto',
    ])
    expect(parsed).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)>' }, { type: 'image', path: path(2), w: 1200, h: 800 }])
    expect(imagePaths(parsed)).toEqual([path(2)])
    expect(parseBlocks('não é lista')).toEqual([])
  })
})
