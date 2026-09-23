-- Trace qui a ecrit chaque ligne, pour l'afficher dans les notifications de
-- synchronisation en temps reel ("Mis à jour par Julie"). Rempli cote serveur
-- (trigger security definer) a partir du jeton de l'appelant : le client ne
-- peut pas le falsifier.
alter table public.app_data add column if not exists updated_by text;

create or replace function public.app_data_set_updated_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := nullif(public.current_email(), '');
  return new;
end;
$$;

drop trigger if exists app_data_set_updated_by_trg on public.app_data;
create trigger app_data_set_updated_by_trg
  before insert or update on public.app_data
  for each row execute function public.app_data_set_updated_by();