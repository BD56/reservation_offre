# Réservations des offres

Application web **Google Apps Script** de prise de réservations pour les offres du
magasin (produits à préparer ou évènements), utilisée **à l'accueil sur PC** et adossée
à un Google Sheets (onglets `Operations`, `Reservations`, `Articles`).
© 2026 DESJARDINS Bryan.

> Reprise de travail (assistants IA) : lire [`MEMOIRE_CLAUDE.md`](MEMOIRE_CLAUDE.md) et le
> dépôt `guide-assistant` (style de travail).

## Fichiers
Serveur (une seule portée globale : **un nom déclaré dans deux .gs = erreur**) :
- **00_Constantes.gs** — noms des onglets, colonnes (`OP`, `RES`, `ART`), états, liste des fichiers.
- **Application.gs** — `doGet`, `include_`, outils communs (`avecVerrou_`, `texte_`, `nouvelId_`…).
- **Copie.gs** — copie de la page : toutes les offres + réservations des offres actives
  (glissée dans la page par `doGet`, rechargée par `chargerCopie`).
- **Installation.gs** — contrôle « tous les fichiers à la même version ».
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
  filtres par état, « Reste à préparer », bouton **Retiré** (sans confirmation, « Annuler »
  dans le message), clic sur une ligne = **fiche** (état, coordonnées, quantités,
  suppression confirmée).
- **Feuille de préparation** : aperçu (total à préparer, liste à pointer triée par nom,
  annulées en option) puis impression.

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

## Mettre à jour l'application en service
Chaque fichier porte le même numéro de version. S'il manque un fichier ou qu'un fichier
est resté à l'ancienne version, la page affiche **« Installation incomplète »** au lieu
d'une application à moitié à jour.

### Sans outil (copier-coller dans l'éditeur Apps Script)
1. **Première fois après le découpage :** dans l'éditeur, **supprimer `Code.gs`**
   (sinon Google refuse de lancer le projet : noms déclarés deux fois), puis créer les
   fichiers manquants avec **exactement** les mêmes noms (`+` → Script / HTML, sans
   l'extension).
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
