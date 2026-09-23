-- Sauvegarde quotidienne a 03h15 UTC (04h15 ou 05h15 a Paris selon la saison) :
-- personne n'utilise l'appli a cette heure-la.
-- Le secret est LU EN BASE au moment de l'execution plutot qu'ecrit dans la
-- commande : il n'existe qu'a un seul endroit, public.backup_config.
-- La cle utilisee dans l'en-tete Authorization est la cle "anon", publique par
-- conception (elle est deja dans le code source du site) ; ce qui protege
-- reellement l'appel, c'est l'en-tete x-backup-secret.
select cron.schedule(
  'sauvegarde-app',
  '15 3 * * *',
  $job$
  select net.http_post(
    url := 'https://vkehaerkbvfxlyjvrpzi.supabase.co/functions/v1/backup-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <cle anon : voir SUPABASE_KEY dans public/index.html>',
      'x-backup-secret', (select secret from public.backup_config)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);