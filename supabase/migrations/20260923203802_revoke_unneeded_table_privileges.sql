-- Defense en profondeur (revue du 23/09). Supabase accorde par defaut tous
-- les droits sur les tables de public aux roles anon et authenticated : seules
-- les regles RLS bloquaient. Or anon n'a besoin de rien (l'appli exige une
-- connexion), et authenticated n'a pas a ecrire team_members (team-admin
-- passe par la cle de service) ni a supprimer ou vider app_data (l'appli ne
-- supprime jamais une cle). Une regle ecrite par erreur "to public" resterait
-- ainsi fermee aux visiteurs sans compte (§6.5 de la passation).
-- Teste a blanc avant application : lecture anonyme refusee (42501), membre
-- qui lit et ecrit app_data accepte, suppression et ecriture de team_members
-- refusees.
revoke all on public.app_data, public.team_members from anon;
revoke insert, update, delete, truncate on public.team_members from authenticated;
revoke delete, truncate on public.app_data from authenticated;