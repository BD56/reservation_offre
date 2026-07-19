# Idées de Refactoring - Application Réservation Offre

> **Contexte** : Réflexion sur une refonte de l'architecture actuelle (3 feuilles Google Sheets centrales) vers un modèle **1 feuille par offre**, adapté aux contraintes métier spécifiques.

---

## 📌 Contexte Métier

### Contraintes et Besoins
- **Une seule offre active à la fois** (ou très peu simultanément).
- **Pas de requêtes globales** (ex: "toutes les réservations de Jean Dupont") nécessaires.
- **Pas de dates de début/fin** à gérer pour les offres.
- **Suppression définitive** : Une offre terminée est supprimée (y compris sa feuille Sheets) après **X jours** (configurable).
- **Flexibilité des articles** : Les articles doivent être faciles à ajouter/supprimer.

---

## 🎯 Objectif Principal

**Passer d'une architecture centralisée (3 feuilles : `Operations`, `Reservations`, `Articles`) à un modèle décentralisé** :
- **1 feuille Google Sheets par offre** (ex: `Offre_OP123`).
- **1 feuille `Config`** pour lister les offres actives/terminées.

---

## 🏗️ Architecture Proposée

### 1. Structure des Fichiers Google Sheets

#### **Fichier Principal** (`reservation_offre`)
Contient :
- **Feuille `Config`** : Liste des offres avec métadonnées.
- **Feuilles `Offre_[ID]`** : Une feuille par offre active (ex: `Offre_OP1681234567890`).

#### **Feuille `Config`**
| Colonne          | Type    | Description                          | Exemple               |
|------------------|---------|--------------------------------------|-----------------------|
| `ID_Offre`       | Fixe    | Identifiant unique de l'offre.       | `OP-1681234567890`   |
| `Nom`            | Fixe    | Nom de l'offre.                      | `Offre Pommes`        |
| `Statut`         | Fixe    | État de l'offre (`En cours`/`Terminée`). | `Terminée`         |
| `Date_Terminaison`| Fixe   | Date de passage en "Terminée".        | `15/07/2024 14:30`    |
| `Nom_Feuille`    | Fixe    | Nom de la feuille Sheets associée.     | `Offre_OP1681234567890` |

**Exemple de données** :
```
| ID_Offre         | Nom          | Statut   | Date_Terminaison   | Nom_Feuille          |
|------------------|--------------|----------|--------------------|----------------------|
| OP-1681234567890 | Offre Pommes | Terminée | 15/07/2024 14:30    | Offre_OP1681234567890 |
| OP-1681234567891 | Offre Poires | En cours | -                  | Offre_OP1681234567891 |
```

#### **Feuille par Offre** (ex: `Offre_OP1681234567890`)
**Structure** :
- **Colonnes fixes en premier** (index stable pour le code).
- **Colonnes dynamiques ensuite** (articles, ajout/suppression libre).

| Index | Colonne          | Type       | Description                          | Exemple               |
|-------|------------------|------------|--------------------------------------|-----------------------|
| 0     | `ID_Réservation` | Fixe       | Identifiant unique de la réservation. | `RES-1234567890`      |
| 1     | `Nom`            | Fixe       | Nom du client.                       | `Dupont`              |
| 2     | `Prénom`         | Fixe       | Prénom du client.                    | `Jean`                |
| 3     | `Contact`        | Fixe       | Téléphone ou email.                  | `0612345678`          |
| 4     | `Statut`         | Fixe       | État de la réservation.              | `Réservé`             |
| 5     | `Date_Saisie`    | Fixe       | Date de création de la réservation.  | `15/07/2024 10:00`    |
| 6+    | `[Articles...]`  | Dynamique  | 1 colonne par article (nom = nom de l'article, valeur = quantité). | `Pommes` (valeur: `5`) |

**Exemple de données** :
```
| ID_Réservation | Nom    | Prénom | Contact       | Statut   | Date_Saisie       | Pommes | Poires | Bananes |
|----------------|--------|--------|---------------|----------|-------------------|--------|--------|---------|
| RES-1          | Dupont | Jean   | 0612345678    | Réservé | 15/07/2024 10:00 | 5      | 3      | 0       |
| RES-2          | Martin | Pierre | pierre@mail.com | Contacté | 15/07/2024 11:30 | 2      | 0      | 1       |
```

---

## 🔄 Workflow de Gestion des Offres

### 1. Création d'une Offre
1. **Frontend** :
   - L'utilisateur remplit un formulaire (nom de l'offre, articles prédéfinis si besoin).
2. **Backend** (`Code.gs`) :
   - Générer un `ID_Offre` unique (ex: `OP-<timestamp>`).
   - Créer une nouvelle feuille `Offre_[ID_Offre]` avec :
     - Les colonnes fixes (`ID_Réservation`, `Nom`, `Prénom`, `Contact`, `Statut`, `Date_Saisie`).
     - Les colonnes dynamiques pour les articles (si mode "Prédéfini").
   - Ajouter une entrée dans `Config` avec `Statut = "En cours"`.

### 2. Ajout d'une Réservation
1. **Frontend** :
   - L'utilisateur sélectionne une offre active (via `Config`).
   - Saisie des infos client + quantités par article.
2. **Backend** :
   - Trouver la feuille `Offre_[ID]` via `Config`.
   - Ajouter une nouvelle ligne dans cette feuille avec :
     - Les valeurs fixes (`ID_Réservation`, `Nom`, `Prénom`, etc.).
     - Les quantités pour chaque article (colonnes dynamiques).

### 3. Terminaison d'une Offre
1. **Frontend** :
   - Bouton "Terminer l'offre" dans les détails de l'offre.
   - **Confirmation avec avertissement** :
     > "Êtes-vous sûr de vouloir terminer l'offre **Nom** ?
     > Elle sera **supprimée définitivement dans X jours** (le [date])."
2. **Backend** :
   - Mettre à jour `Statut = "Terminée"` dans `Config`.
   - Enregistrer `Date_Terminaison = date actuelle`.

### 4. Suppression Automatique (Après X Jours)
1. **Déclencheur** :
   - Script Apps Script **planifié** (ex: tous les jours à minuit).
2. **Logique** :
   - Parcourir `Config` pour trouver les offres avec :
     - `Statut = "Terminée"` **ET** `Date_Terminaison + X jours < date actuelle`.
   - Pour chaque offre correspondante :
     - Supprimer la feuille `Offre_[ID]` (via `SpreadsheetApp.deleteSheet()`).
     - Supprimer la ligne dans `Config`.
   - **Logging** : Enregistrer les suppressions dans une feuille `Logs` (optionnel).

---

## ⚙️ Implémentation Technique

### 1. Configuration Centrale (`Config`)
- **Fichier** : `appscript.json` ou feuille `Config` dans Sheets.
- **Paramètres** :
  ```json
  {
    "X_JOURS_AVANT_SUPPRESSION": 7,  // Délai avant suppression définitive
    "NOM_FICHIER_SHEETS": "reservation_offre"
  }
  ```

### 2. Fonctions Backend Clés (`Code.gs`)

#### **Gestion des Offres**
- `creerOffre(nom, articlesPredefinis)` :
  - Crée une feuille `Offre_[ID]` + entrée dans `Config`.
- `terminerOffre(idOffre)` :
  - Met à jour `Statut` et `Date_Terminaison` dans `Config`.
- `nettoyerOffresTerminees()` :
  - Supprime les offres terminées depuis > X jours (appelée par le trigger planifié).

#### **Gestion des Réservations**
- `ajouterReservation(idOffre, data)` :
  - Ajoute une ligne dans la feuille `Offre_[ID]`.
- `mettreAJourStatutReservation(idOffre, idReservation, nouveauStatut)` :
  - Met à jour le `Statut` d'une réservation dans la feuille de l'offre.

#### **Accès aux Données**
- `getOffreById(idOffre)` :
  - Récupère les données d'une offre depuis sa feuille dédiée.
- `getAllOffresActives()` :
  - Liste les offres avec `Statut = "En cours"` depuis `Config`.

### 3. Frontend (`index.html`)
- **Modifications majeures** :
  - Remplacer les appels à `getOperationsData()` (actuel) par `getAllOffresActives()`.
  - Adapter l'affichage des offres pour utiliser `Config` au lieu de `Operations`.
  - Gérer dynamiquement les colonnes d'articles (lecture des noms de colonnes dans la feuille de l'offre).

- **Nouveaux composants** :
  - Bouton "Terminer l'offre" dans les détails de l'offre.
  - Modale de confirmation avec avertissement sur la suppression future.

### 4. Trigger Planifié
- **Configuration** :
  - Dans Apps Script : `Éditeur > Déclencheurs > Ajouter un déclencheur`.
  - **Fonction** : `nettoyerOffresTerminees`.
  - **Type** : Basé sur le temps.
  - **Fréquence** : Tous les jours (ex: à 00:00).

---

## ✅ Avantages de cette Architecture

| **Critère**               | **Bénéfice**                                                                                     |
|---------------------------|-----------------------------------------------------------------------------------------------|
| **Simplicité utilisateur** | 1 feuille = 1 offre → intuitif pour les utilisateurs non-techniques.                          |
| **Flexibilité articles**   | Ajouter/supprimer un article = ajouter/supprimer une colonne → simple et visuel.              |
| **Suppression propre**     | Supprimer une offre = supprimer sa feuille → pas de données orphelines.                      |
| **Performances**           | 1 feuille lue à la fois → pas de problème de performances (1 offre active à la fois).          |
| **Maintenance**            | Structure claire et prévisible pour les développeurs.                                      |
| **Adaptation au contexte** | Parfaitement aligné avec tes contraintes métier (pas de requêtes globales, suppression définitive). |

---

## ⚠️ Points de Vigilance

| **Risque** | **Solution Proposée** |
|------------|----------------------|
| **Limite de 200 feuilles** | Avec ton usage (1 offre active à la fois + suppression après X jours), le risque est **faible**. Si besoin, prévoir un nettoyage plus fréquent. |
| **Erreur de suppression** | Logger les erreurs dans une feuille `Logs` ou via `console.error`. |
| **Offre en cours de modification** | Bloquer la terminaison si des réservations sont en cours (ex: statut ≠ "Retrait" ou "Annulé"). |
| **Changement de X** | Stocker `X_JOURS_AVANT_SUPPRESSION` dans `Config` pour le modifier facilement. |

---

## 📝 Étapes pour la Migration

### Phase 1 : Préparation
1. **Créer la feuille `Config`** dans le fichier Sheets existant.
2. **Adapter `Code.gs`** :
   - Ajouter les fonctions de gestion des feuilles dynamiques (`creerOffre`, `terminerOffre`, etc.).
   - Conserver l'ancienne structure en parallèle (pour rollback si besoin).
3. **Configurer le trigger** pour `nettoyerOffresTerminees`.

### Phase 2 : Migration des Données
1. **Script de migration** :
   - Lire les données existantes (`Operations`, `Reservations`, `Articles`).
   - Pour chaque offre :
     - Créer une feuille `Offre_[ID]`.
     - Copier les réservations et articles dans cette feuille.
     - Ajouter une entrée dans `Config`.
2. **Validation** :
   - Vérifier que toutes les données sont correctement migrées.
   - Tester les fonctionnalités clés (création, réservation, terminaison).

### Phase 3 : Basculer vers la Nouvelle Structure
1. **Mettre à jour le frontend** (`index.html`) pour utiliser les nouvelles fonctions backend.
2. **Désactiver l'ancienne structure** (optionnel : la supprimer après validation).

---

## 💬 Questions Ouvertes

1. **Valeur de X** : Combien de jours après la terminaison faut-il attendre avant la suppression définitive ? (Ex: 7, 30 ?)
2. **Gestion des erreurs** : Faut-il notifier l'utilisateur avant la suppression automatique (ex: email ou toast dans l'app) ?
3. **Backup** : Faut-il prévoir un export automatique des offres avant suppression (ex: dans un Drive dédié) ?
4. **Tests** : Quels scénarios de test prioriser pour valider la migration ?

---

## 📅 Prochaines Étapes

- [ ] Valider cette architecture avec toi.
- [ ] Définir la valeur de `X_JOURS_AVANT_SUPPRESSION`.
- [ ] Implémenter les fonctions backend (`creerOffre`, `terminerOffre`, `nettoyerOffresTerminees`).
- [ ] Adapter le frontend pour la nouvelle structure.
- [ ] Configurer le trigger planifié.
- [ ] Tester la migration des données existantes.
- [ ] Valider avec les utilisateurs finaux.

---

## 💡 Idée Complémentaire : Chargement Progressif des Offres Terminées

### Contexte
Pour optimiser les performances et l'expérience utilisateur, surtout si le nombre d'offres terminées devient important avant leur suppression automatique.

### Principe
- **Au chargement initial du site** :
  - Charger **toutes les offres actives** (statut = `"En cours"`).
  - Charger **X offres terminées les plus récentes** (ex: X = 5 ou 10).
- **Si l'utilisateur veut voir plus d'offres terminées** :
  - Dans la section dédiée (ex: onglet "Offres terminées"), charger **le reste des offres terminées à la demande** (lazy loading par lots).

### Avantages
- **Performances initiales** : Chargement rapide au démarrage (seulement l'essentiel).
- **Économie de ressources** : Moins de données chargées inutiles si l'utilisateur ne consulte jamais les offres terminées.
- **Scalabilité** : Même avec des centaines d'offres terminées, l'app reste réactive.

### Implémentation Proposée

#### Backend (`Code.gs`)
- **Nouvelle fonction** :
  ```plaintext
  function getOffresActivesEtTermineesRecentes(limitTerminees = 5) {
    // 1. Récupère toutes les offres actives + X offres terminées récentes (triées par Date_Terminaison DESC).
    // 2. Retourne :
    //    {
    //      actives: [liste des offres actives],
    //      termineesRecentes: [liste des X offres terminées récentes],
    //      hasMoreTerminees: (booléen indiquant s'il reste des offres terminées non chargées)
    //    }
  }
  ```
- **Fonction pour le lazy loading** :
  ```plaintext
  function getOffresTermineesPaginees(offset, limit) {
    // Récupère les offres terminées de `offset` à `offset + limit` (triées par Date_Terminaison DESC).
    // Utilisé pour charger plus d'offres terminées à la demande.
  }
  ```

#### Frontend (`index.html`)
- **Au chargement** :
  - Appel à `getOffresActivesEtTermineesRecentes(5)` pour afficher :
    - Les offres actives dans le dropdown principal.
    - Les 5 offres terminées récentes dans la section "Offres terminées".
  - Si `hasMoreTerminees = true`, afficher un bouton **"Charger plus"**.

- **Section "Offres terminées"** :
  - Bouton **"Charger plus"** :
    - Appel à `getOffresTermineesPaginees(offset, limit)` pour charger les offres suivantes.
    - Ajoute les nouvelles offres à la liste existante (sans remplacer).
    - Met à jour le bouton (ex: "Charger plus (12 offres)" → "Charger plus (2 offres)").

- **Cache côté client** :
  - Stocker les offres déjà chargées dans un objet (ex: `loadedTerminees = {}`) pour éviter les doublons.

#### Paramètres Configurables
| Paramètre               | Valeur suggérée | Description                          |
|-------------------------|-----------------|--------------------------------------|
| `X` (offres initiales)  | 5               | Nombre d'offres terminées chargées au démarrage. |
| `limit` (par page)      | 10              | Nombre d'offres terminées chargées par clic sur "Charger plus". |

### Workflow Utilisateur
1. **Chargement initial** :
   - L'utilisateur ouvre l'app → **5 offres actives + 5 offres terminées récentes** sont chargées.
   - Le dropdown principal affiche uniquement les offres actives.
   - La section "Offres terminées" affiche les 5 terminées récentes + un bouton **"Charger plus (12 offres)"**.

2. **Consultation des offres terminées** :
   - L'utilisateur clique sur **"Charger plus"** → **10 offres terminées supplémentaires** sont chargées et ajoutées à la liste.
   - Le bouton est mis à jour : **"Charger plus (2 offres)"** (si il reste 2 offres non chargées).

3. **Sélection d'une offre terminée** :
   - L'utilisateur clique sur une offre terminée → ses détails sont chargés **à la demande** (via `getOffreById`).

---

## 📌 Résumé des Idées Validées

| Idée | Statut | Description |
|------|--------|-------------|
| **1 feuille par offre** | ✅ Validée | Architecture principale pour remplacer les 3 feuilles centrales. |
| **Feuille `Config`** | ✅ Validée | Liste centrale des offres avec métadonnées. |
| **Suppression après X jours** | ✅ Validée | Suppression automatique des offres terminées après un délai configurable. |
| **Chargement progressif** | ✅ Validée | Chargement initial léger (actives + X terminées), puis lazy loading pour le reste. |
