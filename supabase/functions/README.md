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

Le code de `team-admin` n'est volontairement pas recopié ici tant que le dépôt
est public (voir §3 de la passation) : il détaille la logique d'administration.
À ajouter le jour où le dépôt passe en privé.

Aucune clé ne figure dans ces fichiers : Supabase injecte `SUPABASE_URL`,
`SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement des
fonctions, et le secret partagé de `backup-daily` est lu dans la table
`public.backup_config`.
