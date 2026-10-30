# Script Google « Rappels par mail »

Envoie les mails du matin des rappels (§37 de la passation). La fonction
Supabase `rappels-quotidiens` calcule ce que chacun doit recevoir et compose
le mail ; ce script ne fait que l'envoyer, depuis le compte Google qui
l'exécute, sous le nom « Please Please · Rappels ».

- **Pourquoi Google** : il fallait un expéditeur sans toucher aux DNS de
  `pleaseplease.fr` (OVH, inaccessibles) ni au compte Brevo déjà authentifié
  pour le domaine (tenu par Gigz).
- **Expéditeur** : l'adresse du compte qui exécute le script
  (maquenot@gmail.com). Une réponse à un rappel arrive donc chez Mathieu.
- **Droits** : `MailApp`, autorisation *Envoyer des e-mails en votre nom*
  seulement. Le script ne lit pas la boîte et n'y touche pas.
- **Protection** : un secret partagé, dans les propriétés du script et dans
  les secrets Supabase. Jamais dans ce dépôt (public).
- **Quota** : 100 destinataires par jour pour un compte Gmail gratuit. Un mail
  par personne et par jour, plus les essais : large.

Ce dossier est la **copie de référence**. Le code qui tourne est celui du projet
Apps Script (même principe que `google/budget-promo/`).

## Installation (une fois, avec le compte maquenot@gmail.com)

1. https://script.google.com → **Nouveau projet**, renommé
   « Rappels par mail — dashboard ».
2. Remplacer le contenu de `Code.gs` par celui de ce dossier.
3. **Paramètres du projet** (roue dentée) → cocher *Afficher le fichier
   manifeste « appsscript.json »* ; remplacer son contenu par celui de ce
   dossier.
4. Choisir la fonction **initialiser** → **Exécuter**. Google demande
   l'autorisation : *Examiner les autorisations* → le compte → *Paramètres
   avancés* → *Accéder à … (non sécurisé)* → **Autoriser** (normal pour un
   script personnel). Le **journal d'exécution** affiche le secret.
5. **Déployer** → *Nouveau déploiement* → roue dentée → **Application Web** :
   exécuter en tant que **Moi**, accès **Tout le monde** → **Déployer**. Copier
   l'**URL de l'application Web** (finit par `/exec`).
6. Supabase → Edge Functions → **Secrets**
   (https://supabase.com/dashboard/project/vkehaerkbvfxlyjvrpzi/functions/secrets) :
   - `RAPPELS_SCRIPT_URL` : l'adresse `/exec` ;
   - `RAPPELS_SCRIPT_SECRET` : le secret du journal.
7. Contrôle : ouvrir l'adresse `/exec` dans un navigateur, la réponse cite
   `rappels-mail` et la version. Puis, une fois la fonction déployée, le bouton
   *M'envoyer un essai* de la page *Rappels par mail*.

## Mettre à jour le script

Recopier le nouveau `Code.gs`, puis **Déployer** → *Gérer les déploiements* →
crayon → *Nouvelle version* (jamais *Nouveau déploiement*, qui changerait
l'adresse). Le secret, rangé dans les propriétés du script, ne change pas.

**Changer le secret** (s'il a fuité) : *Paramètres du projet* → *Propriétés
du script* → supprimer `RAPPELS_SECRET`, relancer **initialiser**, recopier le
nouveau secret dans Supabase.
