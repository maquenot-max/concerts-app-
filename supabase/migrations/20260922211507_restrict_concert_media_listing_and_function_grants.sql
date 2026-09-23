-- Le bucket concert-media est public : ses fichiers se lisent par leur URL
-- /storage/v1/object/public/... sans passer par aucune policy. La policy
-- SELECT ouverte au role "public" ne servait donc pas a afficher les images :
-- elle permettait seulement de LISTER le bucket, y compris sans connexion
-- (constate le 22/09 : noms d'artistes de concerts non annonces visibles).
-- La lecture via l'API (listing, et suppression qui exige aussi SELECT) est
-- reservee aux membres de l'equipe.
drop policy if exists concert_media_select_public on storage.objects;
create policy concert_media_select_team on storage.objects
  for select to authenticated
  using (bucket_id = 'concert-media' and public.is_team_member());

-- Fonctions SECURITY DEFINER : inutiles en anonyme (aucune policy anon ne les
-- appelle). authenticated doit garder EXECUTE : les policies RLS les
-- evaluent avec les droits de l'utilisateur connecte.
revoke execute on function public.is_team_member() from public, anon;
revoke execute on function public.is_team_admin() from public, anon;
revoke execute on function public.app_data_set_updated_by() from public, anon;
grant execute on function public.is_team_member() to authenticated, service_role;
grant execute on function public.is_team_admin() to authenticated, service_role;
grant execute on function public.app_data_set_updated_by() to authenticated, service_role;

-- search_path fige (alerte "function_search_path_mutable") : le corps
-- n'utilise que auth.jwt(), qualifie, et des fonctions de pg_catalog.
alter function public.current_email() set search_path = '';