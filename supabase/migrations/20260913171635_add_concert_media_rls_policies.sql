drop policy app_data_insert_anon on public.app_data;
create policy app_data_insert_anon on public.app_data for insert with check (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media']));

drop policy app_data_update_anon on public.app_data;
create policy app_data_update_anon on public.app_data for update using (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media'])) with check (key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media']));