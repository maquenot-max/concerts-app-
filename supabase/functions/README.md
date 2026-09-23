# Fonctions serveur (Supabase Edge Functions)

Ces fichiers sont la **copie de référence** du code déployé sur Supabase. Ils ne
sont pas servis par Netlify (qui ne publie que `public/`) et ne sont pas
déployés depuis ce dépôt : Supabase en garde la version qui tourne.

Ils sont ici pour qu'une fonction ne puisse pas disparaître avec le tableau de
bord Supabase, et pour que `git log` explique pourquoi elles font ce qu'elles
font. **En cas de modification, déployer puis reporter le changement ici** —
rien ne synchronise les deux automatiquement.

| Fonction | Rôle | Appelée par |
|---|---|---|
| `backup-daily` | Sauvegarde quotidienne de `app_data` dans le bucket privé `backups`, rétention 30 jours | la tâche `pg_cron` `sauvegarde-app`, chaque nuit à 03h15 UTC |
| `team-admin` | Gestion de l'équipe (ajout, mot de passe, rôle, 2FA) | la page *Équipe* de l'application |
| `purge-media` | Supprime du bucket public `concert-media` les photos de rapport expirées ou plus référencées (jamais `artist-photos/` ni `newsletter-photos/`) | **pas encore déployée** — voir ci-dessous |

**`purge-media` n'est pas déployée.** Le code est prêt (23/09) ; l'IA n'a pas
le droit de déployer une fonction qui supprime des fichiers en masse, même
avec l'accord de Mathieu. Marche à suivre, à faire soi-même :

1. Déployer, depuis la racine du dépôt (une connexion `npx supabase login` est
   demandée la première fois) :
   ```bash
   npx supabase functions deploy purge-media --project-ref vkehaerkbvfxlyjvrpzi
   ```
   Sans la CLI : Supabase → Edge Functions → *Deploy a new function* → *Via
   Editor*, nommer la fonction `purge-media`, coller le contenu de
   `purge-media/index.ts`, laisser *Verify JWT* activé.
2. Simulation, dans Supabase → SQL Editor (rien n'est supprimé, la réponse
   liste ce qui le serait ; au 23/09 : la seule photo de rapport du 13/09) :
   ```sql
   select net.http_post(
     url := 'https://vkehaerkbvfxlyjvrpzi.supabase.co/functions/v1/purge-media',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer ' || (select regexp_replace(command, '.*Bearer ([^'']+)''.*', '\1') from cron.job where jobname = 'sauvegarde-app'),
       'x-backup-secret', (select secret from public.backup_config)),
     body := '{"dry": true}'::jsonb);
   -- quelques secondes plus tard :
   select status_code, content from net._http_response order by created desc limit 1;
   ```
3. Si la liste convient, planifier la purge chaque nuit à 03h30 UTC (même
   commande que la tâche `sauvegarde-app`, seule l'URL change) :
   ```sql
   select cron.schedule('purge-medias', '30 3 * * *',
     replace((select command from cron.job where jobname = 'sauvegarde-app'),
             '/functions/v1/backup-daily', '/functions/v1/purge-media'));
   ```
   Contrôle : `net._http_response` le lendemain matin, comme pour la
   sauvegarde (`supprimes` et la liste `fichiers`).

**`team-admin`, version 3 (23/09)** : l'action `add` refuse désormais (409) un
e-mail déjà présent dans `team_members`, au lieu de réinitialiser son mot de
passe et d'écraser son rôle sans prévenir.

Le code de `team-admin` n'est volontairement pas recopié ici tant que le dépôt
est public (voir §3 de la passation) : il détaille la logique d'administration.
À ajouter le jour où le dépôt passe en privé.

Aucune clé ne figure dans ces fichiers : Supabase injecte `SUPABASE_URL`,
`SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement des
fonctions, et le secret partagé de `backup-daily` est lu dans la table
`public.backup_config`.
