grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.board_members to authenticated;
grant select, insert, update, delete on public.columns to authenticated;
grant select, insert, update, delete on public.cards to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

drop policy if exists "members read boards" on public.boards;
create policy "owners and members read boards"
  on public.boards for select
  using (owner_id = auth.uid() or public.is_board_member(id));
