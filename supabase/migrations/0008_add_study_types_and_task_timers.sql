alter type public.card_type add value if not exists 'exercicios';
alter type public.card_type add value if not exists 'estudo';

alter table public.tasks
  add column if not exists tempo_segundos integer not null default 0,
  add column if not exists timer_iniciado_em timestamptz;

alter table public.tasks
  add constraint tasks_tempo_segundos_nonnegative check (tempo_segundos >= 0);
