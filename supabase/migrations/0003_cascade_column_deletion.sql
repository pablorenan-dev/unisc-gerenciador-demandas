alter table public.cards
  drop constraint if exists cards_column_id_fkey;

alter table public.cards
  add constraint cards_column_id_fkey
  foreign key (column_id)
  references public.columns(id)
  on delete cascade;
