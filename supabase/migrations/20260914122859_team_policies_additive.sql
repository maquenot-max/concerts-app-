-- Regles pour les membres de l'equipe connectes. Etape additive : les regles
-- anonymes existantes restent en place jusqu'a la validation de la connexion,
-- puis seront supprimees (migration suivante).
drop policy if exists app_data_select_team on public.app_data;
create policy app_data_select_team on public.app_data
  for select to authenticated using (public.is_team_member());

drop policy if exists app_data_insert_team on public.app_data;
create policy app_data_insert_team on public.app_data
  for insert to authenticated
  with check (public.is_team_member() and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks']));

drop policy if exists app_data_update_team on public.app_data;
create policy app_data_update_team on public.app_data
  for update to authenticated
  using (public.is_team_member())
  with check (public.is_team_member() and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks']));

drop policy if exists concert_media_insert_team on storage.objects;
create policy concert_media_insert_team on storage.objects
  for insert to authenticated with check (bucket_id = 'concert-media' and public.is_team_member());

drop policy if exists concert_media_delete_team on storage.objects;
create policy concert_media_delete_team on storage.objects
  for delete to authenticated using (bucket_id = 'concert-media' and public.is_team_member());