-- Rappels par mail : appel de rappels-quotidiens a 7 h et 8 h UTC. La
-- fonction n'envoie qu'au passage qui tombe a 9 h a Paris (7 h UTC l'ete,
-- 8 h l'hiver) et ignore l'autre. Meme commande que la sauvegarde : le secret
-- est lu dans backup_config a chaque passage, la cle anon est publique.
select cron.schedule(
  'rappels-mail',
  '0 7,8 * * *',
  $job$
  select net.http_post(
    url := 'https://vkehaerkbvfxlyjvrpzi.supabase.co/functions/v1/rappels-quotidiens',
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
