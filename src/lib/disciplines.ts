/** Ícones prontos para disciplinas: voltados à computação, mas cobrindo o resto da grade. */
export const disciplineIcons = [
  ['code', 'Programação'],
  ['terminal', 'Terminal'],
  ['braces', 'Compiladores e linguagens'],
  ['puzzle', 'Algoritmos e estruturas'],
  ['binary', 'Sistemas digitais'],
  ['database', 'Banco de dados'],
  ['network', 'Redes'],
  ['server', 'Servidores'],
  ['cloud', 'Nuvem'],
  ['cpu', 'Arquitetura de computadores'],
  ['circuit', 'Hardware e eletrônica'],
  ['hard-drive', 'Sistemas operacionais'],
  ['brain', 'Inteligência artificial'],
  ['bot', 'Robótica e automação'],
  ['shield', 'Segurança'],
  ['bug', 'Testes e qualidade'],
  ['git', 'Versionamento'],
  ['layers', 'Engenharia de software'],
  ['workflow', 'Processos e modelagem'],
  ['globe', 'Web'],
  ['smartphone', 'Mobile'],
  ['gamepad', 'Jogos'],
  ['pen', 'Design e interface'],
  ['calculator', 'Cálculo'],
  ['sigma', 'Matemática'],
  ['chart', 'Estatística'],
  ['atom', 'Física'],
  ['flask', 'Laboratório'],
  ['users', 'Projeto e gestão'],
  ['lightbulb', 'Empreendedorismo'],
  ['scale', 'Ética e legislação'],
  ['languages', 'Idiomas e comunicação'],
  ['graduation', 'TCC e pesquisa'],
  ['book', 'Leitura e teoria'],
] as const

export type DisciplineIcon = (typeof disciplineIcons)[number][0]

const known = new Set<string>(disciplineIcons.map(([key]) => key))

/** O ícone vem do banco como texto; qualquer valor desconhecido vira o livro. */
export function safeIcon(value: unknown): DisciplineIcon {
  return typeof value === 'string' && known.has(value) ? (value as DisciplineIcon) : 'book'
}

const rules: [RegExp, DisciplineIcon][] = [
  [/estrutura|algor/, 'puzzle'],
  [/banco|dados|sql/, 'database'],
  [/compil|linguagens formais|automat/, 'braces'],
  [/rede|distribu/, 'network'],
  [/intelig|aprendizado|machine|\bia\b/, 'brain'],
  [/engenharia de soft|requisit/, 'layers'],
  [/teste|qualidade/, 'bug'],
  [/operacion/, 'hard-drive'],
  [/arquitetura|organiza|hardware/, 'cpu'],
  [/digital|circuit|eletron/, 'circuit'],
  [/calculo|numeric/, 'calculator'],
  [/matem|algebra|discreta|logica/, 'sigma'],
  [/estat|probab/, 'chart'],
  [/web|internet|front/, 'globe'],
  [/mobile|move|android|ios/, 'smartphone'],
  [/segur|cripto/, 'shield'],
  [/nuvem|cloud|devops/, 'cloud'],
  [/jogo|game/, 'gamepad'],
  [/robo|automacao/, 'bot'],
  [/program|orienta|codigo/, 'code'],
  [/metodolog|tcc|pesquisa|cient/, 'graduation'],
  [/projeto|gestao|gerenc/, 'users'],
  [/ingles|portugu|comunica/, 'languages'],
  [/fisica/, 'atom'],
  [/etica|direito|legisla/, 'scale'],
  [/empreend|inova/, 'lightbulb'],
  [/interface|ihc|design|usabil/, 'pen'],
  [/modelagem|processo/, 'workflow'],
]

/** Sugere um ícone a partir do nome da disciplina ("Banco de Dados" → banco de dados). */
export function suggestIcon(name: string): DisciplineIcon {
  const text = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? 'book'
}

export const disciplineColors = ['#f5a524', '#3b82f6', '#b7c95a', '#ec4899', '#22b8cf', '#a78bfa', '#f97316', '#14b8a6', '#ef6351', '#6366f1', '#22c55e', '#a8a29e']

/** Próxima cor ainda pouco usada, para disciplinas novas não nascerem todas iguais. */
export function nextColor(used: string[]): string {
  return disciplineColors.find((color) => !used.includes(color)) ?? disciplineColors[used.length % disciplineColors.length]
}
