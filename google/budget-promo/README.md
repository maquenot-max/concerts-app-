# Script Google « Budget promo »

Crée les budgets promo du dashboard : copie la trame
**« AAAAMMJJ - BUDGET COM TRAME »** (Drive de Mathieu) à la racine de *Mon
Drive*, la remplit avec les valeurs envoyées par l'appli, et renvoie le lien.
La forme, les formules, les listes déroulantes et le logo sont ceux de la
trame, par construction : le script n'écrit que des valeurs, aux cellules
prévues (voir l'en-tête de `Code.gs`).

- **Qui peut s'en servir** : tout membre connecté de l'équipe, depuis la fiche
  d'un concert. Le script vérifie auprès de Supabase le jeton de session envoyé
  par l'appli ; sans jeton valide d'un membre de `team_members`, il refuse.
- **Où arrivent les budgets** : à la racine du Drive de maquenot@gmail.com (le
  compte qui exécute le script). Chacun est ensuite rangé à la main.
- **Ce qu'il ne fait jamais** : modifier la trame. Une salle absente de la
  liste de la cellule D2 est ajoutée à la liste du budget créé seulement.

Ce dossier est la **copie de référence**. Le code qui tourne est celui du projet
Apps Script : une modification ici ne change rien tant qu'elle n'y est pas
recopiée et redéployée (même principe que `supabase/functions/`).

## Installation (une fois, avec le compte maquenot@gmail.com)

1. Ouvrir https://script.google.com → **Nouveau projet**. Le renommer
   « Budget promo — dashboard ».
2. Remplacer tout le contenu de `Code.gs` par celui de `google/budget-promo/Code.gs`.
3. **Paramètres du projet** (roue dentée, à gauche) → cocher *Afficher le
   fichier manifeste « appsscript.json » dans l'éditeur*. Revenir à l'éditeur et
   remplacer le contenu de `appsscript.json` par celui de ce dossier (il fixe le
   fuseau Europe/Paris et les autorisations).
4. Dans la barre du haut, choisir la fonction **doGet** puis **Exécuter**.
   Google demande d'autoriser le script : *Examiner les autorisations* → choisir
   le compte → *Paramètres avancés* → *Accéder à Budget promo (non sécurisé)* →
   **Autoriser**. C'est normal pour un script personnel qui n'est pas publié :
   il accède à Drive et Sheets (pour copier et remplir la trame) et à Internet
   (pour vérifier la session auprès de Supabase).
5. **Déployer** → *Nouveau déploiement* → roue dentée → **Application Web** :
   - Description : « Budget promo »
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
   → **Déployer**, puis copier l'**URL de l'application Web** (elle finit par
   `/exec`).
   « Tout le monde » est nécessaire pour que l'appli l'appelle sans connexion
   Google ; la protection, c'est la vérification de la session Supabase.
6. Dans le dashboard : menu du compte → **Budget** → *Script Google* → coller
   l'adresse → **Tester**. La réponse doit citer la trame et sa liste de salles.

## Mettre à jour le script

Recopier le nouveau `Code.gs` dans l'éditeur, puis **Déployer** → *Gérer les
déploiements* → crayon → Version : **Nouvelle version** → *Déployer*. L'adresse
ne change pas : rien à modifier dans l'appli.

Avant de recopier une modification : `node google/budget-promo/test.js` (le
script tourné sous Node contre une fausse trame, sans dépendance).

## Si la trame change

Le script ne dépend que de l'emplacement des cellules : D1 (spectacle), D2
(salle, liste déroulante), D3 (date), D4 (type de contrat), B7 (budget alloué),
F7 (mise en vente), et des lignes 13, 27, 41 et 55 où commencent les quatre
sections. Couleurs, libellés, formules, logo, liste des salles : tout peut
changer sans toucher au script. Si une de ces cellules ou lignes bouge, mettre à
jour `SECTIONS` et `doPost` dans `Code.gs`, puis le test.

Si la trame est remplacée par un autre fichier, changer `TRAME_ID` (l'identifiant
dans son adresse : `docs.google.com/spreadsheets/d/<TRAME_ID>/edit`).
