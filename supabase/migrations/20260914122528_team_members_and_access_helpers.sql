-- Equipe autorisee a utiliser l'application. Cette table est la source de
-- verite des regles d'acces : un utilisateur connecte n'accede aux donnees que
-- si son e-mail y figure. Les ecritures passent par la fonction serveur
-- team-admin (cle de service) : aucune politique d'ecriture cote client.
create table if not exists public.team_members (
  email text primary key,
  name text not null default '',
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;

-- E-mail de l'utilisateur connecte (vide sinon), en minuscules.
create or replace function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Ces deux fonctions lisent team_members en "security definer" pour etre
-- utilisables dans les politiques RLS sans dependre des droits du client.
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.current_email())
$$;

create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = public.current_email() and role = 'admin')
$$;

-- Lecture de la liste par les membres connectes uniquement.
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (public.is_team_member());

-- Premier administrateur.
insert into public.team_members (email, name, role) values ('maquenot@gmail.com', 'Mathieu', 'admin')
on conflict (email) do update set role = 'admin';