-- La cle process (modele des taches) n'etait reservee aux administrateurs que
-- dans l'interface (showTab) : un membre pouvait la reecrire par un appel
-- direct a l'API (§7 de la passation). Seuls les administrateurs peuvent
-- desormais l'ecrire. Les cles de configuration Budget suivront avec la
-- reprise du generateur de budget.
-- Teste a blanc avant application : membre qui modifie process refuse
-- (42501), concerts et budget_templates toujours acceptes ; administrateur
-- accepte sur process et concerts.
alter policy app_data_insert_team on public.app_data
  with check (public.is_team_member()
    and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups'])
    and (key <> 'process' or public.is_team_admin()));

alter policy app_data_update_team on public.app_data
  with check (public.is_team_member()
    and key = any (array['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups'])
    and (key <> 'process' or public.is_team_admin()));