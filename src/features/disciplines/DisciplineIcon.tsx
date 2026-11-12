import type { CSSProperties } from 'react'
import {
  Atom, Binary, BookOpen, Bot, Braces, BrainCircuit, Bug, Calculator, ChartColumn, CircuitBoard, Cloud, CodeXml, Cpu, Database,
  FlaskConical, Gamepad2, GitBranch, Globe, GraduationCap, HardDrive, Languages, Layers, Lightbulb, Network, PenTool, Puzzle,
  Scale, Server, ShieldCheck, Sigma, Smartphone, Terminal, Users, Workflow, type LucideIcon,
} from 'lucide-react'
import type { DisciplineIcon as IconKey } from '../../lib/disciplines'
import type { Discipline } from '../../lib/types'

const components: Record<IconKey, LucideIcon> = {
  code: CodeXml, terminal: Terminal, braces: Braces, puzzle: Puzzle, binary: Binary, database: Database, network: Network,
  server: Server, cloud: Cloud, cpu: Cpu, circuit: CircuitBoard, 'hard-drive': HardDrive, brain: BrainCircuit, bot: Bot,
  shield: ShieldCheck, bug: Bug, git: GitBranch, layers: Layers, workflow: Workflow, globe: Globe, smartphone: Smartphone,
  gamepad: Gamepad2, pen: PenTool, calculator: Calculator, sigma: Sigma, chart: ChartColumn, atom: Atom, flask: FlaskConical,
  users: Users, lightbulb: Lightbulb, scale: Scale, languages: Languages, graduation: GraduationCap, book: BookOpen,
}

/** O "selo" da disciplina: ícone sobre um quadradinho na cor dela. */
export function DisciplineIcon({ icon, color, size = 22 }: { icon: IconKey; color: string; size?: number }) {
  const Icon = components[icon] ?? BookOpen
  return (
    <span className="disc-icon" style={{ '--disc': color, width: size, height: size } as CSSProperties} aria-hidden>
      <Icon size={Math.round(size * 0.62)} strokeWidth={2.25} />
    </span>
  )
}

/** Selo + nome. Sem cadastro (card antigo, só com texto), mostra apenas o nome. */
export function DisciplineTag({ discipline, name, size = 20 }: { discipline?: Discipline; name: string; size?: number }) {
  if (!name) return null
  return (
    <span className="disc-tag">
      {discipline && <DisciplineIcon icon={discipline.icon} color={discipline.color} size={size} />}
      <span className="disc-tag__name">{name}</span>
    </span>
  )
}
