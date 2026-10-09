# Dashboard Please Please Communication

Outil interne de suivi des concerts (tâches, sponso, RS, newsletter, budget, report). En ligne sur https://dashboardppcomm.netlify.app/. Mathieu décide ; l'équipe s'en sert au quotidien.

Le document de référence est `passation.md`, **dans le dossier principal** `/Users/mathieu/code/concerts-app-/` (hors dépôt, absent des worktrees, tenu à jour par toutes les sessions). Il fait plus de 1 000 lignes : chercher la section utile (`grep -n '^## ' passation.md`) plutôt que de le lire en entier.

## Avant de commencer

- Plusieurs sessions travaillent en parallèle. Comparer sa base à `main` (`git -C /Users/mathieu/code/concerts-app- log --oneline <base>..main`) et relire la passation du dossier principal : la tâche est peut-être déjà faite.
- Changement visuel un peu large : maquetter d'abord (canevas), coder après le choix de Mathieu. Toute retouche d'interface part du Design System « Braise » (identité au §22).

## Code

- Vanilla, sans build ni `npm install` : `public/index.html` (toute l'appli, JS inline), `public/style.css`.
- Toute écriture dans `app_data` passe par `scheduleSave()` (versions et fusion à trois voies). Exception unique : la restauration de sauvegarde.
- Ajouter une clé à `app_data` = cinq endroits : contrainte `CHECK` et deux policies (migration), `ALL_SAVE_KEYS`, `BACKUP_KEYS`, `CLES` de `supabase/functions/backup-daily` (§2).
- Échappement : `esc()` pour le texte et les attributs ordinaires, `escJs()` dans un `onclick="fn('…')"`, `escUrl()` pour `href`/`src` (§6.6).
- Tailles de texte : pixels entiers de l'échelle de `style.css`, jamais sous 12 px.
- Ne jamais rouvrir l'accès `anon`/`public` en écriture sur `app_data` ou le bucket `concert-media`.
- `supabase/functions/`, `supabase/migrations/` et `google/budget-promo/` sont des copies de référence : un push ne déploie rien. Déployer d'abord, reporter dans le dépôt ensuite (§6.9).

## Vérifier

- `node check.js` : huit contrôles, les mêmes que Netlify avant chaque déploiement. Un hook le relance déjà après chaque modification de `public/`.
- Banc (fausse base, aucune requête vers Supabase) : `node outils/banc/prepare.js` après chaque modification, puis la config `banc` de `.claude/launch.json` (port 8766). Mode d'emploi : `outils/banc/README.md`.
- Changement visuel : `node outils/banc/tour.mjs` (Safari et Chrome, trois largeurs), avant et après.

## Livrer

- Messages de commit détaillés, qui expliquent le pourquoi.
- Chaque déploiement de production coûte 15 crédits Netlify sur 300 par mois, et le site est suspendu à zéro. Regrouper les commits, pousser une seule fois, et seulement après le « go » de Mathieu. Un push qui ne touche ni `public/`, ni `check.js`, ni `netlify.toml` ne déclenche rien.
- Après la mise en ligne : vérifier que les fichiers servis correspondent au commit, puis mettre à jour la passation (en-tête et section dédiée).
- Une nouvelle règle valable pour toutes les sessions (après un incident, une demande de Mathieu) : la détailler dans la passation **et** l'ajouter ici en une ligne.

## Fin de session

Tout ce que la session a créé et qui ne sert plus va à la corbeille, jamais `rm` (un hook le bloque) : captures de `outils/banc/captures/`, profils Chrome du `$TMPDIR`, scratchpad, worktree fusionné, serveurs restés ouverts. Ne jamais toucher aux fichiers de Mathieu. Détail : §6, point 11.
