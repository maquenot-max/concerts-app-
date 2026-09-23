-- Fin de la bascule securite : plus aucun acces anonyme (ni public) aux
-- donnees et aux ecritures du bucket. Seuls les membres connectes
-- (politiques *_team) lisent et ecrivent. La lecture publique des photos
-- du rapport (concert_media_select_public) est conservee volontairement.
drop policy if exists app_data_select_anon on public.app_data;
drop policy if exists app_data_insert_anon on public.app_data;
drop policy if exists app_data_update_anon on public.app_data;
drop policy if exists concert_media_insert_anon on storage.objects;
drop policy if exists concert_media_delete_anon on storage.objects;