# Idées de Refactoring - Application Réservation Offre

> **Contexte** : Réfonte de l'architecture actuelle (3 feuilles Google Sheets centrales) vers un modèle **1 feuille par offre**, adapté aux contraintes métier spécifiques.
>
> **Statut** : architecture **validée et arbitrée** (voir § *Décisions arbitrées*). Prête à implémenter.

---

## 📌 Contexte Métier

### Contraintes et Besoins
- **Une seule offre active à la fois** (ou très peu simultanément).
- **Saisie par les hôtes d'accueil**, pas par les clients : les noms d'articles sont saisis par une équipe réduite et formée (point important, cf. § *Règles de gestion des articles*).
- **Pas de requêtes globales** (ex: "toutes les réservations de Jean Dupont") nécessaires.
- **Pas de dates de début/fin** à gérer pour les offres.
- **Suppression définitive** : une offre terminée est supprimée (y compris sa feuille Sheets) après **X = 365 jours (1 an)**, configurable.
- **Flexibilité des articles** : les articles doivent être faciles à ajouter/supprimer.
- **Deux types d'offres conservés** : `Produit` (avec articles) et `Evenement` (sans articles).
- **Deux modes de saisie conservés** : `Predefini` (liste d'articles figée) et `Libre` (l'hôte saisit les articles au fil de l'eau).

---

## 🎯 Objectif Principal

**Passer d'une architecture centralisée (3 feuilles : `Operations`, `Reservations`, `Articles`) à un modèle décentralisé** :
- **1 feuille Google Sheets par offre** (ex: `Offre_OP-1681234567890`).
- **1 feuille `Config`** pour lister les offres actives/terminées.

---

## 🏗️ Architecture Proposée

### 1. Structure des Fichiers Google Sheets

#### **Fichier Principal** (`reservation_offre`)
Contient :
- **Feuille `Config`** : liste des offres avec métadonnées.
- **Feuilles `Offre_[ID]`** : une feuille par offre (active ou terminée non encore purgée).

#### **Feuille `Config`**
| Colonne           | Type  | Description                                   | Exemple                  |
|-------------------|-------|-----------------------------------------------|--------------------------|
| `ID_Offre`        | Fixe  | Identifiant unique de l'offre.                | `OP-1681234567890`       |
| `Nom`             | Fixe  | Nom de l'offre.                               | `Offre Pommes`           |
| `Type`            | Fixe  | `Produit` ou `Evenement`.                     | `Produit`                |
| `Mode_Saisie`     | Fixe  | `Predefini` ou `Libre` (vide si `Evenement`). | `Predefini`              |
| `Statut`          | Fixe  | `En cours` ou `Terminée`.                     | `Terminée`               |
| `Date_Terminaison`| Fixe  | Date de passage en "Terminée".                | `15/07/2024 14:30`       |
| `Nom_Feuille`     | Fixe  | Nom de la feuille Sheets associée.            | `Offre_OP-1681234567890` |

> **Note** : `Type` et `Mode_Saisie` sont indispensables — le frontend s'en sert pour décider s'il affiche la section articles et si la saisie est libre ou contrainte.

**Exemple de données** :
```
| ID_Offre         | Nom          | Type     | Mode_Saisie | Statut   | Date_Terminaison | Nom_Feuille              |
|------------------|--------------|----------|-------------|----------|------------------|--------------------------|
| OP-1681234567890 | Offre Pommes | Produit  | Predefini   | Terminée | 15/07/2024 14:30 | Offre_OP-1681234567890   |
| OP-1681234567891 | Offre Poires | Produit  | Libre       | En cours | -                | Offre_OP-1681234567891   |
| OP-1681234567892 | Dégustation  | Evenement| -           | En cours | -                | Offre_OP-1681234567892   |
```

> **Règle de nommage** : `Nom_Feuille = "Offre_" + ID_Offre` (le tiret de l'ID est conservé). Le nom est stocké explicitement dans `Config` : c'est lui qui fait foi, jamais une reconstruction à la volée.

#### **Feuille par Offre** (ex: `Offre_OP-1681234567890`)
**Structure** :
- **Colonnes fixes en premier** (index stable pour le code).
- **Colonnes dynamiques ensuite** (articles, ajout/suppression libre).

| Index | Colonne          | Type       | Description                                                        | Exemple            |
|-------|------------------|------------|--------------------------------------------------------------------|--------------------|
| 0     | `ID_Réservation` | Fixe       | Identifiant unique de la réservation.                              | `RES-1234567890`   |
| 1     | `Nom`            | Fixe       | Nom du client.                                                     | `Dupont`           |
| 2     | `Prénom`         | Fixe       | Prénom du client.                                                  | `Jean`             |
| 3     | `Contact`        | Fixe       | Téléphone ou email.                                                | `0612345678`       |
| 4     | `Statut`         | Fixe       | État de la réservation.                                            | `Réservé`          |
| 5     | `Date_Saisie`    | Fixe       | Date de création de la réservation.                                | `15/07/2024 10:00` |
| 6+    | `[Articles...]`  | Dynamique  | 1 colonne par article (en-tête = nom de l'article, valeur = quantité). | `Pommes` → `5`  |

> **Offre de type `Evenement`** : la feuille ne contient **que les 6 colonnes fixes**, aucune colonne d'article. Aucun cas particulier à coder côté structure.

**Exemple de données** :
```
| ID_Réservation | Nom    | Prénom | Contact         | Statut   | Date_Saisie      | Pommes | Poires | Bananes |
|----------------|--------|--------|-----------------|----------|------------------|--------|--------|---------|
| RES-1          | Dupont | Jean   | 0612345678      | Réservé  | 15/07/2024 10:00 | 5      | 3      | 0       |
| RES-2          | Martin | Pierre | pierre@mail.com | Contacté | 15/07/2024 11:30 | 2      | 0      | 1       |
```

---

## 🧩 Règles de gestion des articles

Le modèle « 1 colonne = 1 article » implique que **le nom d'un article définit la structure de la feuille**. Une faute de frappe ne crée donc plus une simple ligne sale, mais **une colonne permanente**, et surtout elle **scinde le résumé** de la fiche de préparation (« Pommes : 12 » et « pommes : 3 » comptés séparément) — or c'est ce chiffre qui sert aux préparateurs.

Comme la saisie est faite par les **hôtes d'accueil** (équipe réduite et formée), le risque est faible, mais il doit être neutralisé par deux règles :

### 1. Normalisation à l'écriture
Avant de créer une colonne pour un article :
- `trim` + réduction des espaces multiples ;
- comparaison **insensible à la casse et aux accents** avec les colonnes existantes de l'offre ;
- **si une correspondance existe → réutiliser la colonne existante**, ne jamais en créer une nouvelle.

### 2. Autocomplétion à la saisie (mode `Libre`)
L'hôte qui tape « Pom » se voit proposer « Pommes » si la colonne existe déjà dans l'offre. Coût faible : les colonnes de l'offre sont déjà lues à l'ouverture.

### 3. Suppression d'un article : **avertir**
Supprimer un article = supprimer sa colonne = **perdre les quantités déjà saisies**.

Comportement retenu : **avertissement explicite avec décompte réel**, puis confirmation.
> « **7 réservations** ont une quantité sur « Pommes ». Supprimer cet article effacera ces quantités. Confirmer ? »

Le décompte s'obtient en lisant la colonne avant suppression (comptage des cellules non vides et > 0).

---

## 🔄 Workflow de Gestion des Offres

### 1. Création d'une Offre
1. **Frontend** : l'utilisateur remplit un formulaire (nom, type, mode de saisie, articles prédéfinis si besoin).
2. **Backend** (`Code.gs`) :
   - Générer un `ID_Offre` unique (`OP-<timestamp>`).
   - Créer la feuille `Offre_[ID_Offre]` avec :
     - les 6 colonnes fixes ;
     - les colonnes d'articles (si `Type = Produit` **et** `Mode_Saisie = Predefini`).
   - Ajouter une entrée dans `Config` avec `Statut = "En cours"`.

### 2. Ajout d'une Réservation
1. **Frontend** : sélection d'une offre active (via `Config`), saisie des infos client + quantités par article.
2. **Backend** :
   - Trouver la feuille via `Config.Nom_Feuille`.
   - En mode `Libre` : appliquer la **normalisation** (§ *Règles de gestion des articles*) et créer la colonne uniquement si l'article est réellement nouveau.
   - Ajouter une ligne : valeurs fixes + quantités dans les colonnes correspondantes.

### 3. Terminaison d'une Offre
1. **Frontend** : bouton « Terminer l'offre », avec **confirmation et avertissement** :
   > « Êtes-vous sûr de vouloir terminer l'offre **Nom** ?
   > Elle sera **supprimée définitivement le [date]** (dans X jours). »
2. **Backend** :
   - `Statut = "Terminée"` dans `Config`.
   - `Date_Terminaison = date actuelle`.

### 4. Suppression Automatique (Après X Jours)
1. **Déclencheur** : script Apps Script **planifié**, tous les jours à 00:00.
2. **Logique** :
   - Parcourir `Config` : `Statut = "Terminée"` **ET** `Date_Terminaison + X jours < aujourd'hui`.
   - Pour chaque offre concernée :
     - supprimer la feuille `Offre_[ID]` (`SpreadsheetApp.deleteSheet()`) ;
     - supprimer la ligne dans `Config`.
   - **Logging** des suppressions (feuille `Logs` ou `console.error` pour les échecs).

> ⚠️ **Aucune sauvegarde n'est réalisée avant suppression** (décision arbitrée). La suppression est **définitive et assumée** : si la fiche n'a pas été imprimée avant, la donnée est perdue.

---

## ⚙️ Implémentation Technique

### 1. Paramètres de configuration

| Paramètre                   | Valeur | Description                                  |
|-----------------------------|--------|----------------------------------------------|
| `X_JOURS_AVANT_SUPPRESSION` | `365`  | Délai avant suppression définitive (1 an).   |
| `LIMITE_TERMINEES_INITIALE` | `5`    | Offres terminées chargées au démarrage.      |
| `LIMITE_TERMINEES_PAGE`     | `10`   | Offres terminées chargées par « Charger plus ». |

> ⚠️ **Ne PAS stocker ces paramètres dans `appsscript.json`** : c'est le **manifeste** Apps Script, il n'accepte que des clés connues. Y ajouter des clés arbitraires (ex. `triggers`) est sans effet, voire casse le déploiement.
>
> **Stockage retenu** : les **Script Properties** (`PropertiesService.getScriptProperties()`), ou une cellule dédiée de la feuille `Config`. Les deux permettent de modifier la valeur **sans redéployer**.

### 2. Fonctions Backend Clés (`Code.gs`)

#### **Gestion des Offres**
- `creerOffre(nom, type, modeSaisie, articlesPredefinis)` : crée la feuille `Offre_[ID]` + l'entrée `Config`.
- `terminerOffre(idOffre)` : met à jour `Statut` et `Date_Terminaison`.
- `nettoyerOffresTerminees()` : supprime les offres terminées depuis > X jours (appelée par le trigger).

#### **Gestion des Réservations**
- `ajouterReservation(idOffre, data)` : ajoute une ligne dans la feuille de l'offre (avec normalisation des articles en mode `Libre`).
- `mettreAJourStatutReservation(idOffre, idReservation, nouveauStatut)`.

#### **Gestion des Articles**
- `ajouterArticle(idOffre, nomArticle)` : ajoute une colonne (après normalisation).
- `compterReservationsAvecArticle(idOffre, nomArticle)` : sert à l'avertissement avant suppression.
- `supprimerArticle(idOffre, nomArticle)` : supprime la colonne (après confirmation côté frontend).

#### **Accès aux Données**
- `getOffreById(idOffre)` : lit la feuille dédiée (métadonnées + réservations + résumé).
- `getAllOffresActives()` : liste les offres `En cours` depuis `Config`.
- `getOffresActivesEtTermineesRecentes(limitTerminees)` / `getOffresTermineesPaginees(offset, limit)` : cf. § *Chargement progressif*.

### 3. Concurrence (écritures simultanées)
Aucune protection n'existe aujourd'hui : deux réservations enregistrées en même temps peuvent se marcher dessus lors de l'ajout de ligne (ou pire, lors de la **création concurrente d'une colonne d'article** en mode `Libre`).

**À prévoir** : encadrer toutes les écritures par `LockService.getScriptLock()` (`waitLock` + `releaseLock` dans un `finally`).

### 4. Frontend (`index.html`)
- Remplacer `getOperationsData()` par `getOffresActivesEtTermineesRecentes()`.
- Alimenter l'affichage depuis `Config` au lieu de `Operations`.
- **Lire dynamiquement les colonnes d'articles** dans la feuille de l'offre (l'en-tête fait foi).
- Autocomplétion des articles en mode `Libre`.
- Avertissement avec décompte avant suppression d'un article.
- Confirmation de terminaison mentionnant la **date de suppression** calculée.
- Le cache client global de préchargement des détails devient **largement inutile** : lister = lire `Config`, ouvrir une offre = lire **une seule** feuille. À simplifier lors du basculement.

### 5. Trigger Planifié
> ⚠️ Un trigger **ne se déclare pas dans `appsscript.json`**.

Deux moyens valides :
- **Manuel** : `Éditeur Apps Script > Déclencheurs > Ajouter un déclencheur` → fonction `nettoyerOffresTerminees`, type « Horloge », fréquence quotidienne (00:00).
- **Programmatique** : `ScriptApp.newTrigger('nettoyerOffresTerminees').timeBased().everyDays(1).atHour(0).create()` — en veillant à **ne pas créer de doublon** (supprimer les triggers existants du même nom avant création).

---

## ✅ Avantages de cette Architecture

| **Critère**               | **Bénéfice**                                                                                   |
|---------------------------|-------------------------------------------------------------------------------------------------|
| **Simplicité utilisateur** | 1 feuille = 1 offre → intuitif pour les utilisateurs non-techniques.                             |
| **Flexibilité articles**   | Ajouter/supprimer un article = ajouter/supprimer une colonne → simple et visuel.                 |
| **Résumé trivial**         | Le total par article = **somme d'une colonne** (au lieu d'une jointure + agrégation en mémoire). |
| **Suppression propre**     | Supprimer une offre = supprimer sa feuille → pas de données orphelines.                          |
| **Performances**           | 1 feuille lue à la fois → pas de lecture des données de toutes les offres.                       |
| **Maintenance**            | Structure claire et prévisible pour les développeurs.                                            |
| **Adaptation au contexte** | Aligné avec les contraintes métier (pas de requêtes globales, suppression définitive).            |

---

## ⚠️ Points de Vigilance

| **Risque** | **Solution Proposée** |
|------------|----------------------|
| **Accumulation de feuilles** | Avec X = **1 an**, on accumule ~**25 à 50 onglets** (à 1-2 offres/mois). Techniquement sans problème (très loin de la limite de 10 M de cellules du classeur), mais le classeur devient **moins agréable à parcourir à la main**. C'est le vrai coût de la rétention longue, et il est accepté. |
| **Colonnes doublons (mode `Libre`)** | Normalisation à l'écriture + autocomplétion (§ *Règles de gestion des articles*). |
| **Perte de données à la suppression d'un article** | Avertissement avec décompte réel + confirmation explicite. |
| **Écritures concurrentes** | `LockService` sur toutes les écritures (création de colonne incluse). |
| **Erreur de suppression** | Logger les échecs (feuille `Logs` ou `console.error`). |
| **Offre en cours de modification** | Possibilité de bloquer la terminaison si des réservations sont encore en statut « Réservé »/« Contacté » (à confirmer). |
| **Changement de X** | Stocké en Script Properties / `Config` → modifiable sans redéploiement. |
| **Suppression définitive** | **Aucun backup** : la donnée est irrécupérable. À compenser par la visibilité de la date de suppression dans l'UI. |

---

## 📝 Étapes pour la Migration

### Phase 1 : Préparation
1. Créer la feuille `Config` (avec `Type` et `Mode_Saisie`).
2. Adapter `Code.gs` : fonctions de gestion des feuilles dynamiques, **en conservant l'ancienne structure en parallèle** (rollback possible).
3. Créer le trigger `nettoyerOffresTerminees`.

### Phase 2 : Migration des Données
1. **Script de migration** (doit être **idempotent** : relançable sans créer de doublons) :
   - Lire `Operations`, `Reservations`, `Articles`.
   - Pour chaque offre : créer `Offre_[ID]`, y recopier réservations et articles (articles → colonnes), ajouter l'entrée `Config`.
2. **Validation** : vérifier l'intégralité des données migrées et tester les fonctions clés.

### Phase 3 : Basculement
1. Mettre à jour le frontend pour utiliser les nouvelles fonctions.
2. Simplifier le cache client (devenu superflu).
3. Désactiver puis supprimer l'ancienne structure après validation.

---

## ✅ Décisions Arbitrées

*(Ces points étaient ouverts ; ils sont désormais tranchés.)*

| Sujet | Décision |
|-------|----------|
| **Valeur de X** | **365 jours (1 an)**, configurable. Retenu plutôt que 2 ans : la feuille contient des **données personnelles** (nom, téléphone, email) et le RGPD impose une conservation limitée au nécessaire. Plus facile d'allonger ensuite que de justifier une conservation trop longue. |
| **Type `Evenement`** | **Conservé**, même s'il sera moins utilisé que `Produit`. Une offre `Evenement` = feuille sans colonnes d'articles. |
| **Mode `Libre`** | **Conservé.** Le risque de colonnes doublons est faible (saisie par les hôtes d'accueil, pas les clients) et neutralisé par la normalisation + l'autocomplétion. |
| **Suppression d'un article avec réservations** | **Avertir** avec le décompte réel des réservations impactées, puis confirmer. |
| **Backup avant suppression auto** | **Non.** Aucun stockage sur Drive, aucun export automatique. Si la fiche n'a pas été imprimée à temps, la donnée est perdue — assumé. |
| **Export PDF manuel** | **Conservé** : le flux « Télécharger le récap (PDF) puis supprimer » de la suppression manuelle reste en place. Il télécharge sur le poste de l'utilisateur, à sa demande, **sans rien stocker côté Drive** → conforme à la décision ci-dessus. |
| **Notification avant suppression auto** | Pas d'email. Afficher la **date de suppression** sur les offres terminées, et ne passer en alerte visible que dans les ~30 derniers jours (un badge « dans 700 jours » n'a aucun intérêt). |
| **Chargement progressif** | **Nécessaire** (et non plus optionnel) : avec 1 an de rétention, 25-50 offres terminées s'accumulent. |
| **Tests prioritaires** | Migration **idempotente**, création d'offre + réservation, terminaison, et surtout le **nettoyage automatique** (seule opération irréversible). |

---

## 📅 Prochaines Étapes

- [x] Valider l'architecture.
- [x] Définir `X_JOURS_AVANT_SUPPRESSION` (**365**).
- [x] Arbitrer `Type` / `Mode_Saisie` / suppression d'article / backup.
- [ ] Implémenter les fonctions backend (`creerOffre`, `terminerOffre`, `nettoyerOffresTerminees`, gestion des colonnes d'articles).
- [ ] Ajouter `LockService` sur les écritures.
- [ ] Adapter le frontend (lecture dynamique des colonnes, autocomplétion, avertissements).
- [ ] Créer le trigger planifié.
- [ ] Écrire et tester le script de migration (idempotent).
- [ ] Basculer, puis simplifier le cache client.
- [ ] Valider avec les utilisateurs finaux.

---

## 💡 Chargement Progressif des Offres Terminées

> **Statut : nécessaire.** Avec X = 1 an, 25 à 50 offres terminées coexistent. Les charger toutes au démarrage est exclu.

### Principe
- **Au chargement initial** :
  - toutes les offres **actives** (`Statut = "En cours"`) ;
  - les **5 offres terminées les plus récentes**.
- **À la demande** : le reste des offres terminées, par lots de 10 (lazy loading).

### Avantages
- **Performances initiales** : démarrage rapide (seulement l'essentiel).
- **Économie de ressources** : rien de superflu si l'utilisateur ne consulte jamais les terminées.
- **Scalabilité** : l'app reste réactive quel que soit l'historique.

### Implémentation Proposée

#### Backend (`Code.gs`)
```plaintext
function getOffresActivesEtTermineesRecentes(limitTerminees = 5) {
  // 1. Lit UNIQUEMENT la feuille Config.
  // 2. Retourne :
  //    {
  //      actives: [...],                 // toutes les offres "En cours"
  //      termineesRecentes: [...],       // X terminées les plus récentes (Date_Terminaison DESC)
  //      totalTerminees: n,              // pour afficher le reste à charger
  //      hasMoreTerminees: bool
  //    }
}

function getOffresTermineesPaginees(offset, limit) {
  // Terminées de `offset` à `offset + limit` (Date_Terminaison DESC). Lit uniquement Config.
}
```

> **Note** : ces deux fonctions ne lisent que `Config` — donc très rapides. Les **détails** d'une offre (réservations, résumé) ne sont lus qu'à l'ouverture de celle-ci, via `getOffreById`.

#### Frontend (`index.html`)
- **Au chargement** : `getOffresActivesEtTermineesRecentes(5)` →
  - offres actives dans le dropdown principal ;
  - 5 terminées récentes dans la section « Offres terminées » ;
  - bouton **« Charger plus (N offres) »** si `hasMoreTerminees`.
- **« Charger plus »** : `getOffresTermineesPaginees(offset, limit)`, ajout à la liste existante (sans remplacer), mise à jour du compteur du bouton.
- **Cache client** : mémoriser les offres déjà chargées (ex. `loadedTerminees = {}`) pour éviter les doublons.
- **Ouverture d'une offre terminée** : détails chargés **à la demande** via `getOffreById`.

#### Paramètres Configurables
| Paramètre              | Valeur | Description                                            |
|------------------------|--------|--------------------------------------------------------|
| `X` (offres initiales) | 5      | Offres terminées chargées au démarrage.                |
| `limit` (par page)     | 10     | Offres terminées chargées par clic sur « Charger plus ». |

---

## 📌 Résumé des Idées Validées

| Idée | Statut | Description |
|------|--------|-------------|
| **1 feuille par offre** | ✅ Validée | Architecture principale remplaçant les 3 feuilles centrales. |
| **Feuille `Config`** | ✅ Validée | Liste centrale des offres, enrichie de `Type` et `Mode_Saisie`. |
| **Types `Produit` / `Evenement`** | ✅ Conservés | `Evenement` = feuille sans colonnes d'articles. |
| **Modes `Predefini` / `Libre`** | ✅ Conservés | `Libre` sécurisé par normalisation + autocomplétion. |
| **Suppression après X jours** | ✅ Validée | **365 jours**, configurable, **sans backup**. |
| **Avertissement suppression d'article** | ✅ Validée | Décompte réel des réservations impactées + confirmation. |
| **Chargement progressif** | ✅ Nécessaire | Actives + 5 terminées récentes, puis lazy loading par 10. |
| **`LockService` sur les écritures** | ✅ À ajouter | Protège des enregistrements concurrents. |
