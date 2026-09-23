-- Alerte "extension_in_public" : pg_net ne supporte pas ALTER EXTENSION ...
-- SET SCHEMA, il faut le reinstaller. Ses fonctions vivent de toute facon dans
-- le schema "net" (net.http_post, utilise par la tache cron sauvegarde-app),
-- recree a l'identique. Aucune dependance declaree (verifie le 22/09).
drop extension if exists pg_net;
create extension pg_net schema extensions;