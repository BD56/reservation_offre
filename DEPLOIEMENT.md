# Guide technique — modèle, mises à jour, secours

Pour Bryan (ou un successeur) : comment le code arrive dans les Google Sheets. Les
magasins, eux, n'ont besoin que du lien de copie et de
[`docs/guide/avant-d-installer.md`](docs/guide/avant-d-installer.md) : l'assistant de
l'application fait le reste.

## 1. Comment c'est organisé
- **Le dépôt GitHub** : le code (`*.gs`, `*.html`, `appsscript.json` à la racine). Rien
  d'autre n'est envoyé à Apps Script (`.claspignore` en liste blanche).
- **Le modèle** : un Google Sheets vierge qui contient le code, avec l'onglet
  « Démarrer » et son bouton vert. Les magasins le copient (lien `/copy`).
- **Les installations** : une copie du modèle par magasin, sur un compte Google
  Carrefour, déployée en « Application Web » (adresse `/exec`).

## 2. Poste de travail (une fois)
`npm install`, puis `npx clasp login`. Pour chaque projet Apps Script (modèle, Sheet de
test) : un dossier avec `.clasp.json` (copie de `.clasp.json.exemple`, identifiant du
script : Apps Script → ⚙️ Paramètres du projet).

## 3. Avant de publier une version
`npm run nouvelle-version`, `npm test`, `npm run lint`. Chaque fichier porte alors le même
numéro : un fichier oublié ou ancien fait afficher « Installation incomplète ».

## 4. Le modèle

### Le créer (une seule fois)
1. Dans un dossier à part :
   `npx clasp create --type sheets --title "MODÈLE — Réservations des offres (ne pas utiliser)"`.
   ⚠️ clasp **remplace `appsscript.json` sans demander** : le remettre aussitôt avec
   `git restore appsscript.json`.
2. `npm run push` (répondre **oui** pour écraser le manifeste).
3. Ouvrir le Sheet → Extensions → Apps Script → fonction **`preparerModele`**
   (`Assistant.gs`) → **Exécuter** → autorisations (**Tout sélectionner**). Le journal
   d'exécution affiche « Modèle prêt (version …) » : onglets créés, modèle marqué,
   onglet « Démarrer » et son bouton vert posés.
4. **Recharger** le Sheet (le bouton n'apparaît qu'après).
5. Renommer le **projet** Apps Script (titre en haut de l'éditeur) « Réservations des
   offres » : c'est ce nom qu'affichent les écrans d'autorisation de Google, dans toutes
   les copies.
6. Partager : Accès général → « Tous les utilisateurs disposant du lien » → **Lecteur**.
7. Lien à donner : l'adresse du modèle, fin `/edit…` remplacée par `/copy`. Il ne change
   jamais. Le garder **hors du dépôt**.

### Le mettre à jour
Dans son dossier : `git pull`, `npm run push`, relancer **`preparerModele`**, recharger.

### Ne jamais
Le déployer, ouvrir son application, cliquer sur son bouton vert, y saisir quoi que ce
soit. Pour essayer : faire une copie.

## 5. Mettre à jour une installation existante
1. Dans le dossier relié à ce projet : `git pull`, `npm run push`. clasp remplace **tout**
   le projet : un fichier absent du dossier est supprimé d'Apps Script.
2. Dans le Sheet : 🚀 APPLICATION → ⚙️ Gestion de l'application → Installation →
   **Vérifier**. Le compte rendu doit finir par « Version … » sans « INSTALLATION
   INCOMPLÈTE ». Accepter les autorisations si Google en demande.
3. Extensions → Apps Script → Déployer → **Gérer les déploiements** → crayon ✏️ →
   Version : **Nouvelle version** → Déployer. **Jamais « Nouveau déploiement »** : il
   donnerait une autre adresse, et les PC resteraient sur l'ancienne.
4. Sur les PC de l'accueil : recharger la page.

Le code envoyé à l'étape 1 sert **tout de suite** au Sheet (fenêtres) ; l'adresse
`/exec` sert la version **figée** au dernier déploiement, d'où l'étape 3. Une version qui
ajoute des onglets ou des colonnes (`SCHEMA`) les crée d'elle-même à la première
ouverture de l'application.

### Revenir en arrière
- Les PC : Gérer les déploiements → crayon → Version : une **version antérieure**.
- Le Sheet (fenêtres) suit le code **envoyé** : `git checkout <commit>`, `npm run push`,
  Vérifier.

## 6. Sans clasp (secours)
Copier-coller dans l'éditeur Apps Script :
1. Paramètres du projet → cocher « Afficher le fichier manifeste », pour voir
   `appsscript.json`.
2. Pour **chaque** fichier `*.gs` et `*.html` de la racine du dépôt, et
   `appsscript.json` : tout sélectionner dans l'éditeur et coller le contenu **brut**
   (bouton _Raw_ sur GitHub). Créer ceux qui manquent avec **exactement** le même nom
   (sans extension dans l'éditeur ; type Script ou HTML).
3. **Supprimer** tout fichier de l'éditeur qui n'est plus dans le dépôt (ex. un ancien
   `Code.gs`) : deux fonctions de même nom empêchent le projet de tourner.
4. Puis § 5, étapes 2 à 4. « Vérifier » dit quel fichier est oublié ou ancien.

## 7. Pièges connus
- **Autorisations case par case** : Google laisse décocher une case ; sans l'adresse
  e-mail, le propriétaire n'est plus reconnu. L'assistant et la fenêtre Gestion le
  détectent (« Autoriser de nouveau »). Au déploiement, Google redemande souvent les
  autorisations et en retire une : c'est prévu dans l'assistant.
- **Qui a accès** : « Tous les utilisateurs du domaine Carrefour » (manifeste :
  `access: DOMAIN`), seulement possible depuis un compte Google Carrefour. Chaque PC doit
  avoir son navigateur connecté à un compte Carrefour. « Utilisateur accédant à
  l'application Web » ne marche pas : l'application tournerait sous le compte du PC, qui
  n'a pas accès au Google Sheets.
- **Adresse de l'application** : celle collée dans l'assistant, ou notée par `doGet` dès
  qu'un PC l'ouvre. Jamais `ScriptApp.getService().getUrl()` hors de l'application (sur
  une copie pas encore déployée, elle mène nulle part).
- **Fichiers de même nom** : Apps Script ne distingue pas les extensions (jamais un `.gs`
  et un `.html` du même nom).
