# Installation pour un nouveau magasin (modèle à copier)

> Pour **mettre à jour** une installation en service (ex. Carrefour Vannes) : voir
> « Mettre à jour l'application en service » dans le [`README.md`](README.md).
>
> ⚖️ Mentions légales : tout déploiement par un tiers nécessite l'**accord écrit
> préalable de l'auteur** (DESJARDINS Bryan). Le code est visible dans la copie du
> magasin (c'est le fonctionnement de Google Apps Script).

Principe (comme l'application des chèques) : un **classeur modèle vierge** contient déjà
tout le code. Un nouveau magasin le **copie**, clique sur **Installer**, **déploie**,
règle son nom dans l'application, et c'est prêt. Aucun copier-coller de code.

---

## A. Créer le modèle (Bryan, UNE SEULE FOIS)

1. Sur ton compte Google, créer un **Google Sheets vierge** nommé par exemple
   **« MODÈLE — Réservations des offres (ne pas utiliser) »**.
2. **Extensions → Apps Script**. Supprimer le contenu de `Code.gs` (ou le fichier), puis
   créer les fichiers suivants avec **exactement** ces noms et y coller le contenu
   **intégral** du dépôt (bouton _Raw_ sur GitHub) :
   - **+ → Script** : `00_Constantes`, `Application`, `Arrivages`, `Copie`,
     `Installation`, `Operations`, `Reglages`, `Reservations` ;
   - **+ → HTML** : `Index`, `Style`, `Icones`, `ScriptCommun`, `ScriptCopie`,
     `ScriptImpression`, `ScriptOffres`, `ScriptSaisie`.
3. **Enregistrer**, revenir au classeur et **le recharger** (F5).
4. Menu **🚀 APPLICATION → 🧰 Installer / vérifier l'installation** → accepter les
   autorisations. _(« Google n'a pas validé cette application » → Paramètres avancés →
   Accéder au projet : normal pour un script personnel.)_ Les onglets `Operations`,
   `Reservations`, `Articles` et `Arrivages` sont créés ; le compte rendu doit finir par
   « Version … » **sans** « INSTALLATION INCOMPLÈTE ».
5. **Partager** le modèle : _Partager → Accès général → « Tous les utilisateurs disposant
   du lien » → Lecteur_.
6. Le **lien à donner aux magasins** : celui du modèle, en remplaçant la fin `/edit…` par
   **`/copy`** :
   ```
   https://docs.google.com/spreadsheets/d/<ID-DU-MODÈLE>/copy
   ```
   Ce lien ne change jamais.

### ⛔ Règles pour le modèle

- Il reste **vierge pour toujours** : **ne pas le déployer**, ne pas ouvrir son
  application, ne rien y saisir (ni offre, ni réservation, ni réglage).
- Pour faire des essais : **faire une copie** et tester sur la copie.
- À chaque nouvelle version du code : **mettre à jour le modèle** (mêmes étapes que pour
  une installation en service, sans le redéploiement). Les copies déjà faites ne sont
  **pas** mises à jour automatiquement.

---

## B. Installer pour un nouveau magasin (~5 minutes)

De préférence avec un **compte Google du magasin** (par exemple celui de l'accueil)
plutôt qu'un compte personnel : les réservations restent au magasin si la personne
change de poste.

1. Ouvrir le **lien `/copy`** → **Créer une copie** (renommer, ex. « Réservations —
   Magasin X »). Le code est copié avec le classeur.
2. Dans la copie : menu **🚀 APPLICATION → 🧰 Installer / vérifier l'installation** →
   accepter les autorisations. Ça crée ce qui manque et **efface tout réglage hérité**
   du modèle (voir plus bas). _(Si le menu n'apparaît pas : recharger la page.)_
3. **Mettre l'application en ligne** : _Extensions → Apps Script → **Déployer** →
   **Nouveau déploiement**_ → type **Application Web** :
   - **Exécuter en tant que : Moi** ;
   - **Qui a accès** : au choix du magasin. « **Tout le monde** » : aucun compte Google
     n'est demandé sur les PC de l'accueil, mais **toute personne qui a le lien** voit
     et modifie les réservations (l'application n'a pas de code d'accès). Sinon,
     limiter l'accès aux comptes Google du magasin.

   → **Déployer** → copier l'**URL** (`…/exec`) : c'est l'adresse à ouvrir sur les PC de
   l'accueil (la mettre en favori). Ne donner à l'accueil **que ce lien**, pas celui du
   Google Sheets.
4. Ouvrir l'URL, puis **⚙️ Réglages du magasin** (en haut à droite) :
   - **nom du magasin, avec l'article** (« l'Hypermarché X », « le Super U de Y » — lu
     dans les mentions légales : « L'auteur concède à … ») ;
   - **titre de l'onglet** du navigateur (affiché à la prochaine ouverture).
5. **Offres et réservations → Nouvelle offre** : c'est prêt.

Tout se fait ensuite dans l'application (offres, réservations, arrivages, feuille de
préparation). Le Google Sheets ne sert que de stockage : ne pas le modifier à la main.

---

## Pourquoi « Installer » efface les réglages d'une copie

Les réglages (nom du magasin, titre) sont stockés dans le classeur et **marqués avec son
identifiant**. Si Google les recopie lors d'une copie, l'application le détecte
(identifiant différent) et **les efface** : un nouveau magasin ne garde jamais le nom
d'un autre. Les **données** (onglets) ne sont jamais effacées.
Ce nettoyage a lieu à l'installation, à la première ouverture de l'application ou au
premier enregistrement des réglages — jamais sur un classeur déjà installé.
