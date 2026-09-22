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

**`purge-media` n'est pas déployée.** Le code est prêt (23/09) mais son
déploiement et sa tâche `pg_cron` attendent un feu vert explicite, puisqu'elle
supprime des fichiers. Une fois déployée : l'appeler d'abord en simulation
(corps `{"dry": true}`, même secret `x-backup-secret` que `backup-daily`) pour
lire la liste de ce qu'elle supprimerait, puis planifier une tâche
`purge-medias` calquée sur `sauvegarde-app` (par exemple à 03h30 UTC).

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
