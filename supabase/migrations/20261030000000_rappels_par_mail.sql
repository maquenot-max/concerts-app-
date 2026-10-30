-- Rappels par mail (30/10/2026, demande d'Anne-Claire elargie par Mathieu) :
-- reglages dans la cle rappels d'app_data, envois notes dans rappels_envois.
-- La fonction rappels-quotidiens est planifiee a part
-- (rappels_par_mail_planifier), une fois Resend en place.

-- 1. Cle rappels. Ecriture ouverte a tout membre, comme les autres cles non
-- reservees : chacun y coupe ses propres rappels (muets). Les destinataires
-- n'y sont que des adresses : la fonction ne les envoie qu'aux membres de
-- team_members.
alter table public.app_data drop constraint app_data_key_allowlist;
alter table public.app_data add constraint app_data_key_allowlist
  check (key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups','rappels']::text[]));

alter policy app_data_insert_team on public.app_data
  with check (is_team_member()
    and key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups','rappels']::text[])
    and (key <> ALL (ARRAY['process','budget_templates','style_adjustments','regles_salles']::text[]) or is_team_admin()));

alter policy app_data_update_team on public.app_data
  with check (is_team_member()
    and key = ANY (ARRAY['concerts','taskstates','process','tkcols','tktasks','rsposts','budget_templates','style_adjustments','regles_salles','concert_media','concert_tasks','artist_photos','city_groups','rappels']::text[])
    and (key <> ALL (ARRAY['process','budget_templates','style_adjustments','regles_salles']::text[]) or is_team_admin()));

-- Pre-remplie : la synchro temps reel n'ecoute que les UPDATE.
insert into public.app_data (key, value) values ('rappels', '{}')
on conflict (key) do nothing;

-- 2. Journal des envois. Une ligne par personne et par jour, posee AVANT
-- l'envoi (index unique) : un second passage de la tache ne renvoie rien.
-- Les essais (bouton de la page) sont notes a part, 5 par jour au plus.
-- Ecrit par la fonction seule (cle de service) ; lu par les admins (bloc
-- « Derniers envois »).
create table if not exists public.rappels_envois (
  id bigint generated always as identity primary key,
  jour date not null,
  email text not null,
  essai boolean not null default false,
  statut text not null default 'envoi' check (statut in ('envoi','envoye','erreur')),
  nb integer not null default 0,
  detail text,
  at timestamptz not null default now()
);
create unique index if not exists rappels_envois_un_par_jour on public.rappels_envois (jour, email) where not essai;
alter table public.rappels_envois enable row level security;
revoke all on public.rappels_envois from anon, authenticated;
grant select on public.rappels_envois to authenticated;
create policy rappels_envois_select_admin on public.rappels_envois
  for select to authenticated using (is_team_admin());

-- Trois mois suffisent pour savoir si un mail est parti.
select cron.schedule('purge-rappels-envois', '50 3 * * *',
  $$delete from public.rappels_envois where at < now() - interval '3 months'$$);
