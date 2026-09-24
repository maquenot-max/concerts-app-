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

## Ce que le banc ne couvre pas

La vraie authentification (connexion, 2FA), les règles RLS réelles, le vrai
script Google (tester sa logique avec `node google/budget-promo/test.js`). Pour les règles d'accès, tester en SQL dans un bloc annulé (voir la
revue du 23/09 dans la passation).

`site/` contient des données réelles : il est exclu du dépôt.
