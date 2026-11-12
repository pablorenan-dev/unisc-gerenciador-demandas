-- 0011: disciplinas cadastradas por quadro, com ícone e cor.
-- Migration ADITIVA. Pode ser executada mais de uma vez.
-- A coluna de texto cards.disciplina é MANTIDA (continua recebendo o nome), então a versão
-- antiga do app segue funcionando até o novo deploy.
--
-- O que ela faz com os dados existentes: cria uma disciplina para cada nome já digitado em
-- cards.disciplina (por quadro) e liga os cards a ela. Nenhum texto é apagado.
--
-- Para desfazer:
--   alter table public.cards drop column if exists discipline_id;
--   drop table if exists public.disciplines;
--   drop function if exists public.ensure_card_discipline_same_board();

create table if not exists public.disciplines (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  icone text not null default 'book' check (icone ~ '^[a-z0-9-]{1,40}$'),
  cor text not null default '#a8a29e' check (cor ~ '^#[0-9a-fA-F]{3,8}$'),
  created_at timestamptz not null default now()
);

-- Mesmo nome não se repete no quadro (sem diferenciar maiúsculas nem espaços nas pontas).
create unique index if not exists disciplines_board_nome_key on public.disciplines (board_id, lower(btrim(nome)));
create index if not exists disciplines_board_id_idx on public.disciplines (board_id);

-- Mesmas regras de acesso das colunas: membros do quadro leem; dono e editores alteram.
alter table public.disciplines enable row level security;
grant select, insert, update, delete on public.disciplines to authenticated;

drop policy if exists "members read disciplines" on public.disciplines;
create policy "members read disciplines" on public.disciplines
  for select using (public.is_board_member(board_id));

drop policy if exists "editors manage disciplines" on public.disciplines;
create policy "editors manage disciplines" on public.disciplines
  for all using (public.board_role(board_id) in ('owner', 'editor'))
  with check (public.board_role(board_id) in ('owner', 'editor'));

alter table public.cards
  add column if not exists discipline_id uuid references public.disciplines(id) on delete set null;
create index if not exists cards_discipline_id_idx on public.cards (discipline_id);

-- Uma disciplina só pode ser usada em cards do MESMO quadro.
create or replace function public.ensure_card_discipline_same_board()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.discipline_id is not null and not exists (
    select 1 from public.disciplines d
    where d.id = new.discipline_id and d.board_id = new.board_id
  ) then
    raise exception 'A disciplina não pertence a este quadro' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.ensure_card_discipline_same_board() from public, anon, authenticated;

drop trigger if exists cards_discipline_same_board on public.cards;
create trigger cards_discipline_same_board
  before insert or update of discipline_id, board_id on public.cards
  for each row execute function public.ensure_card_discipline_same_board();

-- Aproveita o que já foi digitado: uma disciplina por nome distinto, por quadro.
-- O ícone é sugerido pelo nome e a cor alterna pela paleta; tudo pode ser trocado depois na tela.
with nomes as (
  select distinct on (board_id, lower(left(btrim(disciplina), 120)))
    board_id, left(btrim(disciplina), 120) as nome
  from public.cards
  where btrim(disciplina) <> ''
  order by board_id, lower(left(btrim(disciplina), 120)), created_at
), numerados as (
  select board_id, nome, row_number() over (partition by board_id order by lower(nome)) as n
  from nomes
)
insert into public.disciplines (board_id, nome, icone, cor)
select
  board_id,
  nome,
  case
    when nome ~* 'banco|dados|sql' and nome !~* 'estrutura' then 'database'
    when nome ~* 'compil|linguagens formais|autômat|automat' then 'braces'
    when nome ~* 'rede|redes|distribu' then 'network'
    when nome ~* 'intelig|aprendizado|machine|\mia\M' then 'brain'
    when nome ~* 'algor|estrutura' then 'puzzle'
    when nome ~* 'engenharia de soft|requisit|qualidade|teste' then 'layers'
    when nome ~* 'operacion' then 'hard-drive'
    when nome ~* 'arquitetura|organiza|digital|hardware|circuit' then 'cpu'
    when nome ~* 'c[aá]lculo|num[eé]ric' then 'calculator'
    when nome ~* 'matem|[aá]lgebra|discreta|l[oó]gica' then 'sigma'
    when nome ~* 'estat|probab' then 'chart'
    when nome ~* 'web|internet|front' then 'globe'
    when nome ~* 'mobile|m[oó]ve|android|ios' then 'smartphone'
    when nome ~* 'segur|cripto' then 'shield'
    when nome ~* 'nuvem|cloud|devops' then 'cloud'
    when nome ~* 'jogo|game' then 'gamepad'
    when nome ~* 'program|orienta|c[oó]digo' then 'code'
    when nome ~* 'metodolog|tcc|pesquisa|cient' then 'graduation'
    when nome ~* 'projeto|gest[aã]o|gerenc' then 'users'
    when nome ~* 'ingl[eê]s|portugu|comunica' then 'languages'
    when nome ~* 'f[ií]sica' then 'atom'
    when nome ~* '[eé]tica|direito|legisla' then 'scale'
    when nome ~* 'empreend|inova' then 'lightbulb'
    when nome ~* 'interface|ihc|design|usabil' then 'pen'
    else 'book'
  end,
  (array['#f5a524', '#3b82f6', '#b7c95a', '#ec4899', '#22b8cf', '#a78bfa', '#f97316', '#14b8a6', '#ef6351', '#6366f1', '#22c55e', '#a8a29e'])[1 + ((n - 1) % 12)]
from numerados
on conflict do nothing;

update public.cards c
set discipline_id = d.id
from public.disciplines d
where c.discipline_id is null
  and btrim(c.disciplina) <> ''
  and d.board_id = c.board_id
  and lower(btrim(d.nome)) = lower(left(btrim(c.disciplina), 120));

-- Cota: disciplinas entram no mesmo controle de volume da 0010 (60 por quadro).
create or replace function public.enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  maximum integer;
  what text;
begin
  if tg_table_name = 'boards' then
    select count(*) into total from public.boards where owner_id = new.owner_id;
    maximum := 50; what := 'quadros por conta';
  elsif tg_table_name = 'columns' then
    select count(*) into total from public.columns where board_id = new.board_id;
    maximum := 30; what := 'colunas por quadro';
  elsif tg_table_name = 'cards' then
    select count(*) into total from public.cards where board_id = new.board_id;
    maximum := 2000; what := 'demandas por quadro';
  elsif tg_table_name = 'tasks' then
    select count(*) into total from public.tasks where card_id = new.card_id;
    maximum := 200; what := 'tarefas por demanda';
  elsif tg_table_name = 'disciplines' then
    select count(*) into total from public.disciplines where board_id = new.board_id;
    maximum := 60; what := 'disciplinas por quadro';
  else
    return new;
  end if;
  if total >= maximum then
    raise exception 'Limite atingido: % %', maximum, what using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_quota() from public, anon, authenticated;

drop trigger if exists disciplines_quota on public.disciplines;
create trigger disciplines_quota before insert on public.disciplines for each row execute function public.enforce_quota();

-- Conferência (opcional):
--   select b.nome as quadro, d.nome, d.icone, d.cor, count(c.id) as demandas
--   from public.disciplines d join public.boards b on b.id = d.board_id
--   left join public.cards c on c.discipline_id = d.id
--   group by 1, 2, 3, 4 order by 1, 2;
