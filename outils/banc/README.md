# Banc de test local

L'appli complète, servie en local contre une **fausse base en mémoire** :
aucune requête ne part vers Supabase, rien ne peut toucher aux vraies
données. C'est la méthode du §6.2 de la passation, rendue prête à l'emploi
(créé à la revue du 23/09/2026, où il a servi à reproduire puis corriger
chaque problème de synchronisation).

## Lancer

```bash
node outils/banc/prepare.js
python3 -m http.server 8765 --directory outils/banc/site
```

Puis ouvrir http://localhost:8765. L'appli démarre connectée, en
administrateur, avec la sauvegarde la plus récente de `.backup/` comme base.
Pour une autre sauvegarde (un export du menu *Sauvegarde*, par exemple) :
`node outils/banc/prepare.js chemin/vers/sauvegarde.json`.

**Relancer `prepare.js` après chaque modification du code** : le banc sert
une copie de `public/`, pas l'original.

## Simuler depuis la console

| Commande | Effet |
|---|---|
| `__banc.remote('concerts', v => { … })` | un collègue modifie une clé, suivi de l'événement temps réel |
| `__banc.remote(cle, fn, qui, true)` puis `__banc.fire(cle)` | idem, mais on choisit quand et dans quel ordre les événements arrivent |
| `__banc.denied = true` | la session perd l'accès (RLS) : lectures vides, écritures refusées |
| `sessionStorage.banc = 'illisible'` ou `'refuse'`, puis recharger | démarrage avec une valeur corrompue, ou sans accès |
| `__banc.writes`, `__banc.log`, `__banc.uploads` | ce que l'appli a écrit, lu, envoyé |
| `__banc.get('taskstates')` | contenu actuel de la fausse base |
| `__banc.scriptAppels`, `__banc.scriptErreur = '…'` | faux script Google du budget promo : ce qui lui a été envoyé, ou une erreur à renvoyer. Adresse à mettre dans *Budget* : n'importe quelle URL contenant `script.google.com` |

Les écritures conditionnelles (`updated_at`), les conflits et l'écho temps
réel de ses propres écritures se comportent comme sur Supabase. Toute autre
requête externe est bloquée et notée dans `__banc.log`.

## Tour dans Safari et Chrome

```bash
node outils/banc/tour.mjs
```

Ouvre 19 écrans (tableau de bord, listes, fiches, événement, newsletter…) à
1 440, 1 024 et 390 px dans Safari puis dans Chrome, et range le tout dans
`outils/banc/captures/<date>/` : `index.html` montre les deux navigateurs côte
à côte, avec pour chaque écran les erreurs JavaScript, une page qui déborde de
côté et le texte qui n'est pas dans les polices de l'interface. Pour ne faire
qu'une partie : `--ecrans fiche`, `--largeurs 390`, `--navigateurs chrome`,
`--url http://localhost:8765/`.

- Aucune dépendance : `safaridriver` est livré avec macOS, Chrome tourne sans
  interface. Pour Safari, cocher une fois *Autoriser l'automatisation à
  distance* dans son menu Développement.
- C'est le Safari du Mac, pas celui de l'iPhone.
- Si le Mac affiche toujours les barres de défilement, Safari perd 15 px de
  large : Chrome est réglé sur la même largeur utile pour comparer.
- La fenêtre de Safari peut rester cachée derrière les autres : Safari fige
  alors transitions et animations, et une capture montrait un onglet encore
  surligné ou une fiche encore hors de l'écran. Le tour les coupe, la page
  s'affiche directement dans son état final.
- Lancer le tour avant et après une modification visuelle, puis comparer
  les deux dossiers.
- Les captures montrent des données réelles : `captures/` est exclu du dépôt.

## Ce que le banc ne couvre pas

La vraie authentification (connexion, 2FA), les règles RLS réelles, le vrai
script Google (tester sa logique avec `node google/budget-promo/test.js`). Pour les règles d'accès, tester en SQL dans un bloc annulé (voir la
revue du 23/09 dans la passation).

`site/` contient des données réelles : il est exclu du dépôt.
