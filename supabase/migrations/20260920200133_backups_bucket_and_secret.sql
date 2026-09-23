-- Bucket de sauvegarde, PRIVE (public = false) : contrairement a
-- concert-media, rien n'y est accessible par URL. Aucune policy n'est creee
-- volontairement : seule la cle de service y accede, donc la fonction
-- planifiee et le tableau de bord Supabase. On recupere une sauvegarde depuis
-- Storage puis on la remet en ligne avec le bouton "Restaurer" de l'appli.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Secret partage entre la tache planifiee et la fonction backup-daily.
-- Genere en base : sa valeur n'apparait nulle part ailleurs. RLS active sans
-- aucune policy => ni anon ni authenticated ne peuvent lire cette table, seule
-- la cle de service le peut.
create table if not exists public.backup_config (
  id          boolean primary key default true check (id),
  secret      text    not null,
  created_at  timestamptz not null default now()
);
alter table public.backup_config enable row level security;
revoke all on public.backup_config from anon, authenticated;

insert into public.backup_config (id, secret)
values (true, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;