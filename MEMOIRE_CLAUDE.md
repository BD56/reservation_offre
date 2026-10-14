# Mémoire de travail — Claude

> Fichier de reprise après compactage du contexte. Dernière mise à jour : 2026-10-14.

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
- **Rien n'est testé sur un vrai Google Sheet** (simulation seulement).

## Contexte (réponses de Bryan, 14/10)
- Utilisé **à l'accueil, sur PC** (pas de tablette).
- **Copie locale des offres actives** voulue : ne plus attendre les chargements.
- **Même look « Comptoir »** que l'app chèques (palette, icônes SVG, sans CDN).
- Ne pas oublier les fonctions : **modifier le contenu d'une offre** (existe), **modifier
  / supprimer une réservation** (n'existe pas), etc.

## Plan validé (une étape = un commit, tests verts, point à Bryan)
1. ✅ Socle.
2. Rapidité : offres injectées par `doGet`, copie locale des offres actives,
   enregistrement instantané + écriture en arrière-plan (« en cours d'envoi »,
   RÉESSAYER), détails préchargés, écritures groupées (suppression en une réécriture).
3. Design « Comptoir » (maquette cliquable d'abord) : sans Bootstrap/CDN, logo à
   l'impression, recherche/filtre des inscrits, modifier/supprimer une réservation.
4. Sécurité : code responsable (+ appareils autorisés ?) pour créer/modifier/supprimer
   les offres — à discuter (aujourd'hui tout le monde ayant le lien peut supprimer).
5. RGPD : purge automatique (durée à décider), mentions.
6. Documentation (AGENTS.md…).

## À vérifier sur un vrai Google Sheet
- Paramètres régionaux du classeur = France (dates « jj/mm/aaaa » reconnues).
- Le manifeste `appsscript.json` réel (accès du déploiement) : le récupérer par
  `clasp pull` avant tout `npm run push`.
- Première mise à jour après découpage : supprimer `Code.gs` dans l'éditeur.
