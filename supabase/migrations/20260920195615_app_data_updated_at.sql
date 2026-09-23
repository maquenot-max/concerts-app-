-- Horodatage des modifications de app_data.
-- Jusqu'ici la table ne portait que updated_by : impossible de dater une
-- modification depuis la base, il fallait comparer deux sauvegardes JSON
-- (c'est ce qui a complique la reparation de l'incident du 20/09/2026).
-- Colonne additive : l'application ne selectionne que key et value, elle ne
-- voit donc pas cette colonne et n'a pas besoin d'etre modifiee.
alter table public.app_data
  add column if not exists updated_at timestamptz not null default now();

-- Le trigger existant remplit deja updated_by a chaque INSERT/UPDATE ;
-- il remplit desormais aussi updated_at, de maniere tout aussi infalsifiable
-- (une valeur envoyee par le client serait ecrasee).
create or replace function public.app_data_set_updated_by()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.updated_by := nullif(public.current_email(), '');
  new.updated_at := now();
  return new;
end;
$function$;