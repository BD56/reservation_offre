/**
 * Configuration centrale pour le projet reservation_offre.
 * Définit les noms des feuilles, colonnes, et paramètres globaux.
 */

/**
 * Noms des feuilles dans le Google Sheet.
 */
const Config = {
  // Noms des feuilles
  SHEET_OPERATIONS: "Operations",
  SHEET_RESERVATIONS: "Reservations",
  SHEET_ARTICLES: "Articles",

  // Colonnes pour la feuille Operations
  COL_OPERATION_ID: 0,
  COL_OPERATION_NOM: 1,
  COL_OPERATION_TYPE: 2,
  COL_OPERATION_DATE_DEBUT: 3,
  COL_OPERATION_DATE_FIN: 4,
  COL_OPERATION_MODE_SAISIE: 5,
  COL_OPERATION_ARTICLES_PREDEFINIS: 6,

  // Colonnes pour la feuille Reservations
  COL_RESERVATION_ID: 0,
  COL_RESERVATION_OPERATION_ID: 1,
  COL_RESERVATION_NOM: 2,
  COL_RESERVATION_PRENOM: 3,
  COL_RESERVATION_CONTACT: 4,
  COL_RESERVATION_ETAT: 5,
  COL_RESERVATION_DATE_SAISIE: 6,

  // Colonnes pour la feuille Articles
  COL_ARTICLE_ID: 0,
  COL_ARTICLE_RESERVATION_ID: 1,
  COL_ARTICLE_NOM: 2,
  COL_ARTICLE_QUANTITE: 3,

  // États possibles pour une réservation
  RESERVATION_STATUSES: ["Réservé", "Contacté", "Retrait", "Annulé"],

  // Types d'opérations
  OPERATION_TYPES: ["Produit", "Evenement"],

  // Modes de saisie
  OPERATION_MODES: ["Libre", "Predefini"],

  // Format de date pour l'affichage
  DATE_FORMAT_DISPLAY: "dd/MM/yyyy",
  DATE_FORMAT_INPUT: "yyyy-MM-dd",
  DATETIME_FORMAT_DISPLAY: "dd/MM/yyyy HH:mm",

  // Timezone par défaut
  TIMEZONE: Session.getScriptTimeZone(),
};

// Exporter pour les autres fichiers
var Config = Config;
