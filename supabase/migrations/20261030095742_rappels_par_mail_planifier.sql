-- Rappels par mail : appel de rappels-quotidiens a 7 h et 8 h UTC. La
-- fonction n'envoie qu'au passage qui tombe a 9 h a Paris (7 h UTC l'ete,
-- 8 h l'hiver) et ignore l'autre. Meme commande que la tache de sauvegarde,
-- seule l'adresse change (methode de purge-medias) : le secret est lu dans
-- backup_config a chaque passage, et la cle anon n'est recopiee nulle part.
select cron.schedule('rappels-mail', '0 7,8 * * *',
  replace((select command from cron.job where jobname = 'sauvegarde-app'),
          '/functions/v1/backup-daily', '/functions/v1/rappels-quotidiens'));
