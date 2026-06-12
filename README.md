# Reservation Offre

Une application Google Apps Script pour la **gestion des réservations clients** par l'accueil de l'Hypermarché Carrefour Vannes.

## 📌 Contexte
L'application permet à l'accueil de saisir les **réservations des clients** pour des offres promotionnelles. Elle enregistre :
- **Les informations du client** : Nom, prénom, et un moyen de contact (téléphone **ou** email).
- **Les articles souhaités** : Liste des produits à réserver avec leurs quantités.

**Hors scope** :
- La gestion des vignettes (non gérée par l'application).
- La gestion du stock (pas de limite de quantité imposée).

**Fonctionnalité à implémenter** :
- Bouton **"Fin de Réservation"** pour une offre : Désactive la possibilité d'ajouter de nouvelles réservations pour cette offre.

## 📁 Structure du Projet

```
reservation_offre/
├── README.md                  # Documentation
├── backend/
│   ├── Config.gs              # Configuration (noms des feuilles, colonnes)
│   ├── Models.gs              # Structures de données (Operation, Reservation, Article)
│   ├── SheetsService.gs       # Service d'accès aux Google Sheets
│   ├── OperationService.gs    # Logique métier pour les opérations
│   ├── ReservationService.gs  # Logique métier pour les réservations
│   └── Main.gs                # Points d'entrée (doGet, fonctions API)
│
└── frontend/
    ├── index.html             # Page principale
    ├── css/
    │   └── styles.css         # Styles personnalisés
    ├── js/
    │   └── app.js              # Logique frontend principale
    └── modals/
        ├── modal-mentions.html     # Mentions légales
        ├── modal-operations.html    # Gestion des opérations
        ├── modal-creer-offre.html   # Création d'une offre
        ├── modal-detail-offre.html  # Détails d'une offre
        ├── modal-confirm-delete.html # Confirmation de suppression
        └── modal-help.html          # Centre d'aide
```

## 🚀 Déploiement

1. **Créer un nouveau projet Google Apps Script** :
   - Allez sur [script.google.com](https://script.google.com) et créez un nouveau projet.
   - Copiez le contenu du dossier `backend/` dans le projet.

2. **Configurer les feuilles Google Sheets** :
   - Créez un Google Sheet avec les onglets suivants :
     - `Operations` (ID, Nom, Type, Date Début, Date Fin, Mode Saisie, Articles Prédéfini)
     - `Reservations` (ID Réservation, ID Opération, Nom, Prénom, Contact, État, Date Saisie)
     - `Articles` (ID Article, ID Réservation, Nom, Quantité)

3. **Déployer l'application web** :
   - Dans l'éditeur Apps Script, cliquez sur **Déployer** > **Nouveau déploiement** > **Application web**.
   - Configurez les autorisations et déployez.

## 🛠 Fonctionnalités

### Backend (Google Apps Script)
- **Gestion des opérations** : Création, lecture, mise à jour, suppression.
- **Gestion des réservations** : Création, mise à jour du statut.
- **Gestion des articles** : Association aux réservations, calcul des quantités.
- **Suppression en cascade** : Suppression d'une opération et de toutes ses réservations/articles.

### Frontend (HTML/JS)
- **Formulaire de réservation** : Saisie des informations client et des articles.
- **Gestion des opérations** : Liste, création, modification, suppression.
- **Détails des réservations** : Affichage, filtrage, impression.
- **Validation des données** : Téléphone, email, champs obligatoires.

## 📝 Utilisation

1. **Créer une offre** :
   - Cliquez sur **Gérer les Opérations** > **Créer une Nouvelle Offre**.
   - Remplissez les informations (nom, type, dates, etc.).

2. **Enregistrer une réservation** :
   - Sélectionnez une offre dans le menu déroulant.
   - Remplissez les informations du client.
   - Ajoutez les articles si nécessaire.
   - Cliquez sur **Vérifier et Valider**.

3. **Modifier le statut d'une réservation** :
   - Dans les détails d'une offre, utilisez le menu déroulant dans la colonne **État**.

4. **Imprimer un récapitulatif** :
   - Dans les détails d'une offre, cliquez sur **Imprimer le Résumé**.

## 🔧 Configuration

Modifiez le fichier `backend/Config.gs` pour adapter les noms des feuilles et des colonnes à votre structure Google Sheets.

## ⚠️ Mentions Légales

© 2026 DESJARDINS Bryan - Tous droits réservés.

L'utilisation de cette application est réservée à l'Hypermarché Carrefour Vannes. Toute reproduction ou modification non autorisée est interdite.
