
drop policy "app_data_insert_anon" on public.app_data;
drop policy "app_data_update_anon" on public.app_data;

create policy "app_data_insert_anon"
  on public.app_data
  for insert
  to anon
  with check (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles'));

create policy "app_data_update_anon"
  on public.app_data
  for update
  to anon
  using (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles'))
  with check (key in ('concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles'));
