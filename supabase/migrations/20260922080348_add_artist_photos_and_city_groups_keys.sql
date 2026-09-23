-- Étend la liste blanche de clés app_data pour la photo par artiste et les
-- groupes de villes (fonctionnalité "sélection newsletter").
alter table public.app_data drop constraint app_data_key_allowlist;
alter table public.app_data add constraint app_data_key_allowlist
  check (key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups']::text[]));

alter policy app_data_insert_team on public.app_data
  with check (is_team_member() and key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups']::text[]));

alter policy app_data_update_team on public.app_data
  with check (is_team_member() and key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups']::text[]));

-- Pré-remplit les deux clés : la synchro temps réel n'écoute que les UPDATE,
-- donc sans ça le tout premier enregistrement de chaque clé ne se
-- propagerait pas aux autres appareils connectés.
insert into public.app_data (key, value) values
  ('artist_photos', '{}'),
  ('city_groups', '[]')
on conflict (key) do nothing;