-- Double authentification : un membre qui a active un facteur TOTP verifie
-- n'accede aux donnees qu'avec une session de niveau 2 (aal2), c'est-a-dire
-- apres avoir saisi son code. Les membres sans facteur restent au niveau 1.
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.current_email())
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
       )
     )
$$;

create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team_member()
     and exists (select 1 from public.team_members where email = public.current_email() and role = 'admin')
$$;