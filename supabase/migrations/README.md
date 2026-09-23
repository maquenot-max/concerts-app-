# Migrations de la base (Supabase)

Copie de référence des migrations appliquées au projet Supabase
`vkehaerkbvfxlyjvrpzi`, dans l'ordre. Comme pour `supabase/functions/`, rien
n'est appliqué depuis ce dépôt : la base garde son propre historique
(`supabase_migrations.schema_migrations`), ces fichiers sont là pour que le
schéma ne dépende pas du seul tableau de bord Supabase et que `git log`
explique ses choix.

Exportées le 23/09/2026 et vérifiées une à une : chaque fichier a la même
empreinte MD5 que la migration enregistrée en base. Une seule retouche : la
clé `anon` de la tâche cron (`schedule_daily_backup`) est remplacée par un
renvoi vers `SUPABASE_KEY` dans `public/index.html`. Elle est publique par
conception, mais aucune clé n'a sa place dans ces fichiers.

**Pour une nouvelle migration** : l'appliquer dans Supabase (SQL Editor, CLI
ou outil `apply_migration`), puis ajouter ici le fichier
`<version>_<nom>.sql` avec exactement le même contenu. L'état réel de la base
(policies, droits, fonctions) se vérifie toujours en base, pas ici.

Ces fichiers ne partent pas avec un push et ne déclenchent pas de
déploiement Netlify (voir `ignore` dans `netlify.toml`).
