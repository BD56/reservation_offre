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
- **Assistant.gs** — assistant d'installation (bouton vert de l'onglet « Démarrer » de la
  copie du modèle) : autorisations Google vérifiées case par case, nom du magasin, mise en
  ligne guidée, lien des PC de l'accueil ; `preparerModele` (pour l'auteur, sur le modèle).
  Réservé aux personnes qui ont accès au Google Sheets (`exigerEditeur_`).
- **Application.gs** — `doGet`, `include_`, outils communs (`avecVerrou_`, `texte_`, `nouvelId_`…).
- **Copie.gs** — copie de la page : toutes les offres + réservations des offres actives
  (glissée dans la page par `doGet`, rechargée par `chargerCopie`).
- **Installation.gs** — onglets et en-têtes créés par le code (`installerFeuilles_`,
  `installer_`), contrôle « tous les fichiers à la même version ».
- **Operations.gs** — offres : détail (offres terminées), création, modification, suppression
  en cascade (onglets réécrits en une fois). Chaque modification renvoie la copie à jour.
- **Reglages.gs** — réglages du magasin (nom avec l'article, titre de l'onglet), modifiés
  dans l'application (⚙️, sans code) ; une copie du classeur repart sans les réglages
  hérités (`nettoyerSiCopie_`, marque `ID_CLASSEUR`).
- **Reservations.gs** — enregistrement d'une réservation (identifiant donné par la page :
  un réessai n'écrit pas deux fois) et de ses articles, changement d'état, modification
  (client, articles, état) et suppression d'une réservation.
- **Sheet.gs** — menu du Google Sheets « 🚀 APPLICATION → ⚙️ Gestion de l'application »
  (`onOpen`, `ouvrirGestion`, `installerDepuisGestion`).
- **appsscript.json** — manifeste : autorisations déclarées (`oauthScopes` = celles que
  l'assistant vérifie), application exécutée sous le compte qui déploie, ouverte aux
  comptes du domaine Carrefour (`access: DOMAIN`).

Page :
- **Index.html** — squelette (+ `COPIE_INITIALE` injectée) qui inclut **Style.html** (style
  « Comptoir », comme l'app chèques), **Icones.html** (icônes SVG) et les scripts
  **ScriptCommun** (outils, écrans, fenêtres), **ScriptCopie** (copie locale, envois en
  arrière-plan, doublons), **ScriptSaisie** (nouvelle réservation), **ScriptOffres** (offres,
  réservations d'une offre, fiche, éditeur d'offre), **ScriptImpression** (feuille de
  préparation) — `<?!= include_('Nom') ?>`. **Aucune ressource externe** (plus de Bootstrap
  ni de CDN).

Fenêtres du Google Sheets (pages complètes) : **FenetreAssistant.html** (assistant en 4
écrans : Préparation, Votre magasin, Mise en ligne, Le PC de l'accueil) et
**FenetreGestion.html** (L'application : lien des PC ; Installation : Vérifier, Ouvrir
l'assistant, règles d'accès).

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

## Installer pour un nouveau magasin
Comme l'app chèques : un **modèle vierge** (Google Sheets avec le code et l'onglet
« Démarrer ») que chaque magasin copie (lien `/copy`, donné par l'auteur). Dans la copie,
le bouton vert **▶ Installer l'application** ouvre l'assistant, qui guide jusqu'au PC de
l'accueil. Aucun copier-coller de code pour le magasin. À envoyer avec le lien :
[`docs/guide/avant-d-installer.md`](docs/guide/avant-d-installer.md).

Les onglets `Operations`, `Reservations`, `Articles` et `Arrivages` (et leurs en-têtes) sont
**créés par le code** (assistant, « Vérifier » de la fenêtre Gestion, ou première ouverture
de l'application). Rien n'est jamais écrasé : sur un classeur déjà en service, seules les
cases d'en-tête vides sont complétées. Une copie repart sans les réglages hérités.

## Modèle, mises à jour, secours
Voir **[`DEPLOIEMENT.md`](DEPLOIEMENT.md)** : créer et mettre à jour le modèle
(`preparerModele`), mettre à jour une installation (`npm run push`, Vérifier, « Nouvelle
version » du déploiement), secours sans clasp. Chaque fichier porte le même numéro de
version : s'il manque un fichier ou qu'un fichier est resté à l'ancienne version, la page
affiche **« Installation incomplète »** au lieu d'une application à moitié à jour.

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
