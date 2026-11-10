create extension if not exists "pgcrypto";

create type public.board_role as enum ('owner', 'editor', 'viewer');
create type public.card_type as enum ('trabalho', 'prova', 'seminario', 'leitura', 'projeto', 'outro');
create type public.priority as enum ('baixa', 'media', 'alta');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 120),
  descricao text not null default '',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.board_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  posicao integer not null default 1000,
  cor text not null default '#94a3b8',
  unique (board_id, posicao)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete restrict,
  titulo text not null check (char_length(titulo) between 1 and 200),
  descricao text not null default '',
  disciplina text not null default '',
  tipo public.card_type not null default 'outro',
  prioridade public.priority not null default 'media',
  data_inicio date,
  data_entrega date,
  posicao integer not null default 1000,
  labels text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 200),
  concluida boolean not null default false,
  data_limite date,
  posicao integer not null default 1000,
  created_at timestamptz not null default now()
);

create index board_members_user_id_idx on public.board_members(user_id);
create index columns_board_id_idx on public.columns(board_id);
create index cards_board_id_idx on public.cards(board_id);
create index cards_column_id_idx on public.cards(column_id);
create index cards_dates_idx on public.cards(data_inicio, data_entrega);
create index cards_created_by_idx on public.cards(created_by);
create index tasks_card_id_idx on public.tasks(card_id);
create index tasks_due_date_idx on public.tasks(data_limite);

create or replace function public.is_board_member(target_board uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.board_members where board_id = target_board and user_id = auth.uid()); $$;

create or replace function public.board_role(target_board uuid)
returns public.board_role language sql stable security definer set search_path = public
as $$ select role from public.board_members where board_id = target_board and user_id = auth.uid(); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''));
  return new;
end;
$$;

create or replace function public.handle_new_board()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.board_members (board_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.columns (board_id, nome, posicao, cor) values
    (new.id, 'A fazer', 1000, '#94a3b8'),
    (new.id, 'Em andamento', 2000, '#4f46e5'),
    (new.id, 'Em revisão', 3000, '#f59e0b'),
    (new.id, 'Concluído', 4000, '#10b981');
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create trigger on_board_created after insert on public.boards for each row execute procedure public.handle_new_board();
create trigger cards_updated_at before update on public.cards for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;
alter table public.tasks enable row level security;

create policy "profiles own read" on public.profiles for select using (id = auth.uid());
create policy "profiles own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "members read boards" on public.boards for select using (public.is_board_member(id));
create policy "owners create boards" on public.boards for insert with check (owner_id = auth.uid());
create policy "owners update boards" on public.boards for update using (public.board_role(id) = 'owner') with check (owner_id = auth.uid());
create policy "owners delete boards" on public.boards for delete using (public.board_role(id) = 'owner');
create policy "members read memberships" on public.board_members for select using (public.is_board_member(board_id));
create policy "owners manage memberships" on public.board_members for all using (public.board_role(board_id) = 'owner') with check (public.board_role(board_id) = 'owner');
create policy "members read columns" on public.columns for select using (public.is_board_member(board_id));
create policy "editors manage columns" on public.columns for all using (public.board_role(board_id) in ('owner', 'editor')) with check (public.board_role(board_id) in ('owner', 'editor'));
create policy "members read cards" on public.cards for select using (public.is_board_member(board_id));
create policy "editors manage cards" on public.cards for all using (public.board_role(board_id) in ('owner', 'editor')) with check (public.board_role(board_id) in ('owner', 'editor'));
create policy "members read tasks" on public.tasks for select using (exists (select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id)));
create policy "editors manage tasks" on public.tasks for all using (exists (select 1 from public.cards c where c.id = card_id and public.board_role(c.board_id) in ('owner', 'editor'))) with check (exists (select 1 from public.cards c where c.id = card_id and public.board_role(c.board_id) in ('owner', 'editor')));
