# Réservations des offres

Application web **Google Apps Script** de prise de réservations pour les offres du
magasin (produits à préparer ou évènements), utilisée **à l'accueil sur PC** et adossée
à un Google Sheets (onglets `Operations`, `Reservations`, `Articles`, `Arrivages`).
© 2026 DESJARDINS Bryan.

> Reprise de travail (assistants IA) : lire [`MEMOIRE_CLAUDE.md`](MEMOIRE_CLAUDE.md) et le
> dépôt `guide-assistant` (style de travail).

## Fichiers
Serveur (une seule portée globale : **un nom déclaré dans deux .gs = erreur**) :
- **00_Constantes.gs** — noms des onglets, colonnes (`OP`, `RES`, `ART`), états, liste des fichiers.
- **Arrivages.gs** — arrivages par lot : quantité reçue d'un article répartie entre les
  clients (`enregistrerArrivage`, la plus ancienne réservation d'abord, même en partie),
  remise au client (`remettre`, retrait partiel permis). Règle : reçu = attribué + en stock.
- **Application.gs** — `doGet`, `include_`, outils communs (`avecVerrou_`, `texte_`, `nouvelId_`…).
- **Copie.gs** — copie de la page : toutes les offres + réservations des offres actives
  (glissée dans la page par `doGet`, rechargée par `chargerCopie`).
- **Installation.gs** — onglets et en-têtes créés par le code (`installerFeuilles_`, menu
  du Sheet `onOpen` → `installerDepuisMenu`), contrôle « tous les fichiers à la même version ».
- **Operations.gs** — offres : détail (offres terminées), création, modification, suppression
  en cascade (onglets réécrits en une fois). Chaque modification renvoie la copie à jour.
- **Reservations.gs** — enregistrement d'une réservation (identifiant donné par la page :
  un réessai n'écrit pas deux fois) et de ses articles, changement d'état, modification
  (client, articles, état) et suppression d'une réservation.

Page :
- **Index.html** — squelette (+ `COPIE_INITIALE` injectée) qui inclut **Style.html** (style
  « Comptoir », comme l'app chèques), **Icones.html** (icônes SVG) et les scripts
  **ScriptCommun** (outils, écrans, fenêtres), **ScriptCopie** (copie locale, envois en
  arrière-plan, doublons), **ScriptSaisie** (nouvelle réservation), **ScriptOffres** (offres,
  réservations d'une offre, fiche, éditeur d'offre), **ScriptImpression** (feuille de
  préparation) — `<?!= include_('Nom') ?>`. **Aucune ressource externe** (plus de Bootstrap
  ni de CDN).

## Écrans
- **Nouvelle réservation** : offre (menu déroulant ; reste choisie pour le client suivant),
  client, articles avec + / − (liste fixe) ou tapés (saisie libre), Entrée pour valider.
- **Offres et réservations** : offres en cours / à venir / terminées (Réservations,
  Feuille, Modifier, Supprimer confirmé dans la carte) ; « Nouvelle offre » (articles en
  étiquettes). Page des réservations d'une offre : recherche (nom, téléphone, email),
  filtres, bouton **Retiré** (sans confirmation, « Annuler » dans le message), clic sur une
  ligne = **fiche** (état, coordonnées, quantités, suppression confirmée).
- **Arrivages** (offres de produits, page des réservations) : quantité reçue d'un article +
  **Répartir** → attribuée aux clients, de la plus ancienne réservation à la plus récente,
  même en partie (« 2/3 ») ; le reste est « en stock ». « Retiré » remet au client tout ce
  qui est arrivé pour lui (le reste suivra) ; « Terminée » quand tout est remis. Dans la
  fiche : commandé, arrivé (limité au stock) et remis par article ; une annulation rend
  au stock ce qui n'a pas été remis.
- **Feuille de préparation** : aperçu (totaux par article : commandé, arrivé, remis, à
  remettre, en stock ; liste à pointer triée par nom, annulées en option) puis impression.

## Rapidité (copie locale)
- À l'ouverture, les offres et les réservations des offres **actives** (fin non passée ou
  sans date) sont déjà dans la page : listes et détail sans attendre le serveur.
- Une réservation est confirmée **tout de suite** et écrite en arrière-plan (« n
  réservation(s) en cours d'envoi… ») ; en cas d'échec, fenêtre « Réservation NON
  enregistrée » avec RÉESSAYER. Le changement d'état est aussi immédiat (remis comme
  avant si le serveur refuse).
- La copie est rechargée au retour sur la fenêtre (si plus de 30 s) et toutes les 2 min
  (saisies de l'autre PC). Offres terminées : réservations chargées à la demande.
- **Alerte doublon** : même offre, même nom et prénom (sans accents ni casse) et même
  téléphone ou email → « Ce client a déjà réservé » (enregistrer quand même possible).

Les fonctions serveur dont le nom finit par `_` ne sont pas appelables depuis la page.

## Installer sur un nouveau Google Sheets
Les onglets `Operations`, `Reservations`, `Articles` et `Arrivages` (et leurs en-têtes) sont
**créés par le code** : à la première ouverture de l'application, ou par le menu du Sheet
**🚀 APPLICATION → 🧰 Installer / vérifier l'installation** (compte rendu : ce qui a été
créé, fichiers manquants, version). Rien n'est jamais écrasé : sur un classeur déjà en
service, seules les cases d'en-tête vides sont complétées. Après une mise à jour qui ajoute des
colonnes ou un onglet (numéro `SCHEMA` de `00_Constantes.gs`), la première ouverture de
l'application les ajoute d'elle-même.
1. Créer un Google Sheets vide, puis Extensions → Apps Script.
2. Créer les fichiers du dépôt (`.gs` et `.html`, mêmes noms) et y coller leur contenu.
3. Recharger le Sheet → menu 🚀 APPLICATION → 🧰 Installer (accepter les autorisations).
4. Déployer → Nouveau déploiement → Application Web.

## Mettre à jour l'application en service
Chaque fichier porte le même numéro de version. S'il manque un fichier ou qu'un fichier
est resté à l'ancienne version, la page affiche **« Installation incomplète »** au lieu
d'une application à moitié à jour.

### Sans outil (copier-coller dans l'éditeur Apps Script)
1. **Première fois après le découpage :** dans l'éditeur, **supprimer `Code.gs`**
   (sinon Google refuse de lancer le projet : noms déclarés deux fois), puis créer les
   fichiers manquants avec **exactement** les mêmes noms (`+` → Script / HTML, sans
   l'extension). Mise à jour « arrivages » : créer **`Arrivages.gs`**.
2. Pour chaque fichier `.gs` / `.html` : tout sélectionner, coller le contenu **Raw** de
   GitHub, enregistrer.
3. **Déployer → Gérer les déploiements → ✏️ sur le déploiement existant → Version :
   Nouvelle version → Déployer** (même URL, ne pas créer de nouveau déploiement).

### Avec clasp (depuis un ordinateur)
1. Une fois : `npm install`, copier `.clasp.json.exemple` en `.clasp.json` avec
   l'identifiant du script, puis **`npx clasp pull`** pour récupérer le vrai manifeste
   `appsscript.json` (il n'est pas encore dans le dépôt : ne pas en inventer un, il
   contient les droits d'accès du déploiement) et le committer.
2. Ensuite : `npm run push` (vérifie les numéros de version puis envoie), puis
   « Nouvelle version » sur le déploiement existant comme ci-dessus.

## Outils de développement
- `npm test` — tests hors ligne : faux Google Sheets (imite la conversion automatique :
  « 0612… » devient un nombre, « 2026-12-01 » une date) et Chromium piloté par
  Playwright avec un faux `google.script.run` branché sur le vrai code serveur.
  Prérequis : Node 20+, `npm install`, navigateur Chromium de Playwright.
- `npm run lint` (ESLint : signale aussi un nom déclaré dans deux fichiers),
  `npm run format` (Prettier).
- `npm run nouvelle-version` — nouveau numéro dans tous les fichiers (avant une mise à jour).
- Rien de `tests/`, `outils/`, `node_modules/` ni `appscript/` n'est envoyé à Apps Script
  (`.claspignore` en liste blanche).
