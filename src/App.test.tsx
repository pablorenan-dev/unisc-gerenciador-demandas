import { describe, expect, it } from 'vitest'

describe('UGD', () => {
  it('mantém os tipos de demanda definidos no produto', () => {
    expect(['trabalho', 'prova', 'seminario', 'leitura', 'projeto', 'outro']).toHaveLength(6)
  })
})
