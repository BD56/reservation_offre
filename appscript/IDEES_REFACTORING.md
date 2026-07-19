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
   - Ajouter une entrée dans `Config` avec `Statut = 