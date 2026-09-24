-- Configuration du generateur de budget promo (budget_templates, refaite le
-- 24/09) : ecriture reservee aux administrateurs, comme process depuis le
-- 23/09. style_adjustments et regles_salles ne sont plus lues par l'appli
-- depuis le 24/09 : verrouillees aussi, pour que personne ne les modifie en
-- croyant agir. Lecture inchangee pour tous les membres (le generateur lit la
-- configuration depuis n'importe quel poste).
-- Teste a blanc avant application : membre refuse (42501) sur budget_templates,
-- regles_salles et process, accepte sur concerts et en lecture ; administrateur
-- accepte.
alter policy app_data_insert_team on public.app_data
  with check (public.is_team_member()
    and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups'])
    and (key <> all (array['process','budget_templates','style_adjustments','regles_salles']) or public.is_team_admin()));

alter policy app_data_update_team on public.app_data
  with check (public.is_team_member()
    and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups'])
    and (key <> all (array['process','budget_templates','style_adjustments','regles_salles']) or public.is_team_admin()));