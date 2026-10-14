-- A APPLIQUER (pas encore en base au 14/10) : renommer ce fichier avec la
-- version que Supabase lui donne, une fois appliquee (§6.9 de la passation).
--
-- Journal d'activite (demande de Mathieu du 14/10/2026) : qui a modifie quoi
-- dans app_data, garde deux mois, lisible par les seuls administrateurs.
--
-- Rempli par un trigger serveur, comme updated_by : le client n'a rien a
-- envoyer, ne peut ni l'ecrire ni le falsifier, et une fonction ajoutee plus
-- tard a l'appli y figure d'office. Chaque ecriture est comparee a la
-- precedente : pour une liste (concerts, posts RS, taches...), element par
-- element grace a leur id, et dans un element modifie, seuls les champs qui
-- changent sont gardes ; pour un objet (taskstates, photos d'artistes...),
-- cle par cle. L'appli traduit ensuite ces differences en phrases.
--
-- Les ecritures d'une meme personne sur un meme element a moins de 15 minutes
-- d'intervalle sont regroupees en une ligne (une saisie de notes enregistree
-- toutes les 1,5 s ne fait qu'une ligne) ; un aller-retour (cocher puis
-- decocher) ne laisse rien.
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  first_at timestamptz not null default now(),
  at timestamptz not null default now(),
  email text,
  key text not null,
  item text not null,
  op text not null check (op in ('add','change','remove')),
  old_value jsonb,
  new_value jsonb,
  writes int not null default 1
);
create index if not exists activity_log_at_idx on public.activity_log (at desc);
create index if not exists activity_log_item_idx on public.activity_log (key, item, at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
drop policy if exists activity_log_select_admin on public.activity_log;
create policy activity_log_select_admin on public.activity_log
  for select to authenticated using (public.is_team_admin());

-- Champs qui different entre deux objets : {"ancien": {...}, "nouveau": {...}},
-- un champ absent d'un cote vaut null de l'autre. null si rien ne differe.
create or replace function public.activity_fields_diff(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'ancien', jsonb_object_agg(k, a -> k),
    'nouveau', jsonb_object_agg(k, b -> k)) end
  from (select jsonb_object_keys(a) k union select jsonb_object_keys(b)) ks
  where (a -> k) is distinct from (b -> k)
$$;

-- Une valeur trop longue pour le journal : sa taille et son empreinte
-- (deux empreintes egales = meme valeur, ce que le regroupement compare).
create or replace function public.activity_trim(v jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when v is null or length(v::text) <= 8000 then v
    else jsonb_build_object('trop_long', length(v::text), 'md5', md5(v::text)) end
$$;

-- Differences entre deux valeurs d'une cle d'app_data.
create or replace function public.activity_diff(o jsonb, n jsonb)
returns table(item text, op text, old_value jsonb, new_value jsonb)
language plpgsql immutable set search_path = '' as $$
declare t text := jsonb_typeof(coalesce(n, o));
begin
  -- Liste d'objets a id unique : element par element.
  if t = 'array'
     and (o is null or jsonb_typeof(o) = 'array') and (n is null or jsonb_typeof(n) = 'array')
     and (select bool_and(jsonb_typeof(e) = 'object' and e ? 'id') and count(*) = count(distinct e ->> 'id')
          from jsonb_array_elements(coalesce(o, '[]'::jsonb)) e) is not false
     and (select bool_and(jsonb_typeof(e) = 'object' and e ? 'id') and count(*) = count(distinct e ->> 'id')
          from jsonb_array_elements(coalesce(n, '[]'::jsonb)) e) is not false then
    return query
      with a as (select e ->> 'id' id, e v from jsonb_array_elements(coalesce(o, '[]'::jsonb)) e),
           b as (select e ->> 'id' id, e v from jsonb_array_elements(coalesce(n, '[]'::jsonb)) e)
      select coalesce(a.id, b.id),
             case when a.id is null then 'add' when b.id is null then 'remove' else 'change' end,
             case when b.id is null then a.v when a.id is null then null
                  else public.activity_fields_diff(a.v, b.v) -> 'ancien' end,
             case when a.id is null then b.v when b.id is null then null
                  else public.activity_fields_diff(a.v, b.v) -> 'nouveau' end
      from a full join b on a.id = b.id
      where a.v is distinct from b.v;
  -- Objet : cle par cle.
  elsif t = 'object' and (o is null or jsonb_typeof(o) = 'object') and jsonb_typeof(n) = 'object' then
    return query
      select coalesce(a.key, b.key),
             case when a.key is null then 'add' when b.key is null then 'remove' else 'change' end,
             a.value, b.value
      from jsonb_each(coalesce(o, '{}'::jsonb)) a full join jsonb_each(n) b on a.key = b.key
      where a.value is distinct from b.value;
  -- Autre cas : la valeur entiere (liste dont un element n'a pas d'id, par
  -- exemple). Au-dela de 8 000 caracteres, une empreinte plutot que la
  -- valeur : sinon chaque ecriture du report (160 Ko) en copierait deux.
  elsif o is distinct from n then
    return query select ''::text, case when o is null then 'add' else 'change' end,
      public.activity_trim(o), public.activity_trim(n);
  end if;
end $$;

create or replace function public.app_data_log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d record; ex public.activity_log%rowtype;
  liste boolean;  -- la cle est une liste : elements compares par id
  champs boolean; -- element de liste : old_value/new_value d'un « change » ne portent que les champs modifies
  op2 text; av jsonb; ap jsonb; f jsonb;
begin
  if tg_op = 'UPDATE' and old.value is not distinct from new.value then return null; end if;
  -- Le journal ne doit jamais empecher un enregistrement : toute erreur ici
  -- est signalee dans les journaux Postgres et l'ecriture passe quand meme.
  begin
    liste := jsonb_typeof(new.value::jsonb) = 'array';
    for d in select * from public.activity_diff(
        case when tg_op = 'UPDATE' then old.value::jsonb end, new.value::jsonb) loop
      champs := liste and d.item <> '';
      select * into ex from public.activity_log l
        where l.key = new.key and l.item = d.item and l.email is not distinct from new.updated_by
          and l.at > now() - interval '15 minutes'
        order by l.at desc limit 1;
      if not found then
        insert into public.activity_log (email, key, item, op, old_value, new_value)
        values (new.updated_by, new.key, d.item, d.op, d.old_value, d.new_value);
        continue;
      end if;
      -- Regrouper avec la ligne precedente : etat avant = celui de la ligne,
      -- etat apres = celui de cette ecriture.
      op2 := null;
      if ex.op = 'add' and d.op = 'remove' then
        delete from public.activity_log where id = ex.id; continue;   -- cree puis supprime
      elsif ex.op = 'add' then
        op2 := 'add'; av := null;
        ap := case when champs then ex.new_value || d.new_value else d.new_value end;
      elsif d.op = 'remove' then
        op2 := 'remove'; ap := null;
        av := case when champs and ex.op = 'change' then d.old_value || ex.old_value else ex.old_value end;
      elsif ex.op = 'remove' then                                     -- supprime puis remis
        op2 := 'change'; av := ex.old_value; ap := d.new_value;
        if champs then
          f := public.activity_fields_diff(av, ap);
          av := f -> 'ancien'; ap := f -> 'nouveau';
        end if;
      else                                                            -- change puis change
        op2 := 'change';
        if champs then
          f := public.activity_fields_diff(d.old_value || ex.old_value, ex.new_value || d.new_value);
          av := f -> 'ancien'; ap := f -> 'nouveau';
        else
          av := ex.old_value; ap := d.new_value;
        end if;
      end if;
      if op2 = 'change' and av is not distinct from ap then
        delete from public.activity_log where id = ex.id;            -- revenu a l'etat de depart
      else
        update public.activity_log set op = op2, old_value = av, new_value = ap,
          at = now(), writes = ex.writes + 1
        where id = ex.id;
      end if;
    end loop;
  exception when others then
    raise warning 'journal d''activite (%) : %', new.key, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists app_data_log_activity_trg on public.app_data;
create trigger app_data_log_activity_trg
  after insert or update on public.app_data
  for each row execute function public.app_data_log_activity();

revoke execute on function public.app_data_log_activity() from public, anon;
revoke execute on function public.activity_diff(jsonb, jsonb) from public, anon;
revoke execute on function public.activity_fields_diff(jsonb, jsonb) from public, anon;
revoke execute on function public.activity_trim(jsonb) from public, anon;
grant execute on function public.app_data_log_activity() to authenticated, service_role;
grant execute on function public.activity_diff(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.activity_fields_diff(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.activity_trim(jsonb) to authenticated, service_role;

-- Deux mois, pas plus : chaque nuit a 03h45 UTC, apres la sauvegarde (03h15)
-- et purge-media (03h30).
select cron.schedule('purge-journal-activite', '45 3 * * *',
  $job$delete from public.activity_log where at < now() - interval '2 months'$job$);
