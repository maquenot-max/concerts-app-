alter table public.app_data drop constraint app_data_key_allowlist;
alter table public.app_data add constraint app_data_key_allowlist check (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks']));

drop policy app_data_insert_anon on public.app_data;
create policy app_data_insert_anon on public.app_data for insert with check (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks']));

drop policy app_data_update_anon on public.app_data;
create policy app_data_update_anon on public.app_data for update using (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks'])) with check (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks']));