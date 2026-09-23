
alter table public.app_data
  add constraint app_data_key_allowlist
  check (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments'));

alter table public.app_data enable row level security;

create policy "app_data_select_anon"
  on public.app_data
  for select
  to anon
  using (true);

create policy "app_data_insert_anon"
  on public.app_data
  for insert
  to anon
  with check (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments'));

create policy "app_data_update_anon"
  on public.app_data
  for update
  to anon
  using (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments'))
  with check (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments'));
