# Mémoire de travail — Claude

> Fichier de reprise après compactage du contexte. Dernière mise à jour : 2026-10-15.

## ▶️ État actuel
- Branche de travail : `claude/happy-franklin-af909r` (pas de pull request).
- Modèle de qualité, de rapidité et d'options : branche `design` de
  `BD56/Gestion-cheque-differe` (lire son AGENTS.md / MEMOIRE_CLAUDE.md pour les choix).
- **Fait** :
  1. Correction des bugs relevés (commit « Corrige les bugs relevés… ») : échappement,
     verrou, écriture en texte (0 des téléphones, formules), gestionnaires d'erreur,
     annulées hors compteurs et hors totaux, validations, fenêtres Bootstrap uniques.
  2. **Étape 1 — socle** : `Code.gs` découpé (00_Constantes, Application, Installation,
     Operations, Reservations), page découpée (Style, ScriptCommun, ScriptSaisie,
     ScriptOffres, ScriptImpression), outils npm (tests, ESLint, Prettier, clasp,
     version), 7 séries de tests vertes. Ajouts : `flush` avant de rendre le verrou,
     identifiants uniques (`nouvelId_` : heure + 4 caractères au hasard — deux offres
     créées dans la même milliseconde avaient le même ID, trouvé par les tests),
     contrôle de version (« Installation incomplète »). Aucun changement visible.
  3. **Étape 2 — rapidité** (« go » de Bryan, 14/10 : 2 PC, surtout 1 à la fois ; alerte
     doublon voulue) : copie injectée par `doGet` (`Copie.gs`, `COPIE_INITIALE`, 0 appel
     au démarrage), offres actives = fin non passée / sans date / date illisible ;
     réservation confirmée tout de suite + envoi en arrière-plan (`ScriptCopie` :
     `enAttente`, indicateur, `beforeunload`, fenêtre « NON enregistrée » + RÉESSAYER,
     copie rechargée après un échec) ; ID créé par la page (`FORMAT_ID_RES`) → réessai
     sans double ; changement d'état immédiat ; création / modification / suppression
     renvoient la copie (`appliquerCopieServeur`, `seqCopie`) ; rechargement au focus
     (> 30 s) et toutes les 2 min ; offres terminées chargées à la demande
     (`horsCopie`) ; suppression = réécriture des onglets en une fois (`reecrire_`,
     textes en texte) ; articles écrits en une fois ; alerte doublon (même offre, nom +
     prénom normalisés, même téléphone OU email ; annulées ignorées) — non bloquante.
     `getOperationsData` supprimée (remplacée par `chargerCopie`). 8 séries de tests.
  4. **Étape 3 — design « Comptoir »** (« go » de Bryan le 15/10 sur la maquette v2 ;
     « Retiré » sans confirmation validé) : Bootstrap et CDN retirés ; `Style.html`
     (palette Comptoir), `Icones.html` (sprite SVG) ; onglets « Nouvelle réservation » /
     « Offres et réservations » ; saisie seule (offre en menu déroulant avec groupes, reste
     choisie après un enregistrement ; articles + / − ; saisie libre : lignes + / −) ; page
     réservations d'une offre (recherche, filtres, reste à préparer, « Retiré » +
     Annuler) ; fiche (état, coordonnées, quantités, suppression) → nouvelles fonctions
     serveur `updateReservation` / `deleteReservation` (renvoient la copie) ; éditeur
     d'offre (articles en étiquettes, une virgule sépare) ; doublon en comparaison +
     « Modifier l'existante » ; échec d'envoi en fenêtre ; feuille de préparation (aperçu,
     tri par nom, annulées en option, impression via `#zoneImpression`). Plus de
     fenêtres natives. Tests réécrits (8 séries), « ses 1 réservation » corrigé.
- **Rien n'est testé sur un vrai Google Sheet** (simulation seulement).

- **Maquette v3 (15/10, demande de Bryan, VALIDÉE et reportée dans l'appli le 15/10)** : fiche réservation,
  éditeur d'offre et aide en FENÊTRES CENTRÉES (`.fenetre-form`, hauteur selon le contenu,
  même style que les alertes ; clic à côté ou Échap = fermer) au lieu des barres
  latérales (trop de vide, 2e style de fenêtre). Page écartée (perd la recherche en
  cours, « ← Retour » de plus). Appli : `#voileFiche`, `#voileOffre`, `#aide` =
  `.voile.centre > .fenetre-form` (plus de `.tiroir` ni de panneau `.aide`).
- **Installation automatique** (demande de Bryan, 15/10, « comme l'app chèques ») :
  `installerFeuilles_` crée les onglets manquants (en-têtes `ENTETES`, gras, ligne figée,
  formats de dates) et complète les cases d'en-tête VIDES seulement (jamais d'écrasement) ;
  `doGet` l'appelle sous verrou si un onglet manque (échec = page ouverte quand même) ;
  menu du Sheet « 🚀 APPLICATION → 🧰 Installer / vérifier l'installation » (`onOpen`,
  `installerDepuisMenu` → compte rendu + contrôle des fichiers + version). Test
  `test_installation` (9 séries). Pas de déclencheurs ni de propriétés à installer pour
  l'instant (viendront avec la sécurité / le RGPD).
- **Un article par ligne** (demande de Bryan, 15/10, après essai sur son vrai Sheet) :
  `listeArticlesHtml` (quantité en gras collée au nom, nom long replié dans sa colonne)
  dans la liste des réservations ET la colonne « Commande » de la feuille.
- **Impression (15/10)** : bug Bryan sous Safari = page blanche à l'impression. L'option A
  (onglet à part) n'a PAS résolu le problème → RETIRÉE (demande de Bryan). Méthode de
  l'app chèques reprise À L'IDENTIQUE : feuille copiée dans `#zoneImpression` (hors
  `.app`), aperçu fermé AVANT `window.print()`, zone JAMAIS vidée après (plus
  d'`afterprint` : sous Safari l'impression ne bloque pas), `@media print` = html/body
  hauteur auto, overflow visible, `display: block`, fond blanc, `.app` masquée. Différences
  avec ma 1re version : vidage à afterprint, body resté flex/100 %, aperçu laissé ouvert.
  Leçon : partir du code qui marche déjà (app chèques) au lieu d'inventer.
  Retour de Bryan : TOUJOURS blanc, et la page RESTE blanche après fermeture de la
  fenêtre d'impression (Imprimer ou Annuler). Cause probable : hauteur de `.app` héritée
  de `body` (body flex + height 100 %) ; l'app chèques fixe `.app { height: 100vh;
  height: 100dvh }` et body n'est pas flex → structure reprise (15/10, version
  2026.10.15-11xx). Test : `.app` garde la hauteur de l'écran même si body passe en
  hauteur automatique. ✅ CONFIRMÉ par Bryan sous Safari (15/10) : c'était bien ça.
- **Noms très longs** (15/10, captures de Bryan : mots sans espace qui sortaient du cadre
  « Reste à préparer » et passaient sous les boutons des cartes d'offre) : règle commune
  `min-width: 0; max-width: 100%; overflow-wrap: anywhere` (infos, reste à préparer,
  comparaison doublon, en-têtes de fenêtre et de feuille, cellules de la feuille,
  étiquettes, message bref) ; quantité collée au nom dans « Reste à préparer » (`.prep`).
  Test `test_ui_textes_longs` (10 séries) : aucun texte hors de sa case ni sous un bouton,
  1366 et 400 px, tous les écrans.
- **Prochaine étape proposée : 4 (sécurité)** — n'importe qui ayant le lien peut supprimer
  une offre ; question posée à Bryan : code responsable seul (conseillé pour 2 PC) ou
  aussi autorisation des appareils comme l'app chèques.

## Contexte (réponses de Bryan, 14/10)
- Utilisé **à l'accueil, sur PC** (pas de tablette).
- **Copie locale des offres actives** voulue : ne plus attendre les chargements.
- **Même look « Comptoir »** que l'app chèques (palette, icônes SVG, sans CDN).
- Ne pas oublier les fonctions : **modifier le contenu d'une offre** (existe), **modifier
  / supprimer une réservation** (n'existe pas), etc.

## Plan validé (une étape = un commit, tests verts, point à Bryan)
1. ✅ Socle.
2. ✅ Rapidité (voir ci-dessus).
3. ✅ Design « Comptoir » (voir ci-dessus). **Pas de logo** (décision de Bryan, 14/10).
   Maquette cliquable (validée en v2 le 15/10) : `docs/maquettes/comptoir-reservations.html`,
   artefact privé https://claude.ai/artifact/7rAHc1LAay3N4j62ZBzX4r. **v2 après retour
   de Bryan** (v1 refusée : tuiles d'offres → MENU DÉROULANT ; écran coupé saisie | liste
   « mal fait, c'était mieux avant » → saisie SEULE et centrée). Propositions v2 :
   onglets « Nouvelle réservation » / « Offres et réservations » ; saisie en 3 étapes
   (offre en menu déroulant avec groupes en cours / terminées + « Voir la liste → »,
   client, articles en + / −) ; page détail d'une offre (← Toutes les offres, recherche,
   filtres par état, « reste à préparer », bouton « Retiré » + Annuler dans le message,
   Feuille de préparation, Modifier l'offre) ; fiche
   réservation (état, coordonnées, quantités, suppression confirmée dans la page) ;
   doublon = comparaison côte à côte (orange) + « Modifier l'existante » ; échec d'envoi
   (rouge, Réessayer) ; écran Offres (en cours / à venir / terminées, suppression
   confirmée) ; éditeur d'offre (articles en puces) ; feuille de préparation (total,
   liste à pointer triée par nom, annulées en option).
4. Sécurité : code responsable (+ appareils autorisés ?) pour créer/modifier/supprimer
   les offres — à discuter (aujourd'hui tout le monde ayant le lien peut supprimer).
5. RGPD : purge automatique (durée à décider), mentions.
6. Documentation (AGENTS.md…).

## À vérifier sur un vrai Google Sheet
- Impression de la feuille dans l'iframe Apps Script (`window.print`, seule
  `#zoneImpression` imprimée) et rendu des icônes SVG (`<use href>`).
- Mise à jour : nouveau fichier `Icones.html` à créer dans l'éditeur.
- Copie injectée par `doGet` : page affichée tout de suite (temps d'ouverture réel).
- `beforeunload` (avertissement à la fermeture pendant un envoi) dans l'iframe Apps Script.
- Réécriture d'un onglet à la suppression : mise en forme manuelle des lignes (couleurs)
  non déplacée avec les données ; formules éventuelles remplacées par leurs valeurs.
- Paramètres régionaux du classeur = France (dates « jj/mm/aaaa » reconnues).
- Le manifeste `appsscript.json` réel (accès du déploiement) : le récupérer par
  `clasp pull` avant tout `npm run push`.
- Première mise à jour après découpage : supprimer `Code.gs` dans l'éditeur.
