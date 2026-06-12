/**
 * Modèles de données pour le projet reservation_offre.
 * Définit les structures des objets utilisés dans l'application.
 */

/**
 * @typedef {Object} Operation
 * @property {string} id - Identifiant unique de l'opération (ex: "OP-123456789").
 * @property {string} nom - Nom de l'opération.
 * @property {string} type - Type de l'opération ("Produit" ou "Evenement").
 * @property {Date|null} dateDebut - Date de début de l'opération.
 * @property {Date|null} dateFin - Date de fin de l'opération.
 * @property {string} modeSaisie - Mode de saisie ("Libre" ou "Predefini").
 * @property {string} articlesPredefinis - Liste des articles prédéfinis (séparés par des virgules).
 * @property {number} countReservations - Nombre de réservations associées (calculé).
 */

/**
 * @typedef {Object} Reservation
 * @property {string} id - Identifiant unique de la réservation (ex: "RES-123456789").
 * @property {string} operationId - Identifiant de l'opération associée.
 * @property {string} nom - Nom du client.
 * @property {string} prenom - Prénom du client.
 * @property {string} contact - Contact du client (téléphone et/ou email).
 * @property {string} etat - État de la réservation ("Réservé", "Contacté", "Retrait", "Annulé").
 * @property {Date|string} dateSaisie - Date et heure de la saisie.
 * @property {string} articlesText - Texte résumant les articles (pour l'affichage).
 */

/**
 * @typedef {Object} Article
 * @property {string} id - Identifiant unique de l'article (ex: "ART-abc12345").
 * @property {string} reservationId - Identifiant de la réservation associée.
 * @property {string} nom - Nom de l'article.
 * @property {number} quantite - Quantité de l'article.
 */

/**
 * @typedef {Object} ResumeArticle
 * @property {string} nom - Nom de l'article.
 * @property {number} total - Quantité totale de l'article (toutes réservations confondues).
 */

/**
 * @typedef {Object} OperationDetails
 * @property {Operation} operation - Détails de l'opération.
 * @property {Reservation[]} reservations - Liste des réservations associées.
 * @property {ResumeArticle[]} resume - Résumé des quantités par article.
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Indique si l'opération a réussi.
 * @property {any} [data] - Données retournées en cas de succès.
 * @property {string} [error] - Message d'erreur en cas d'échec.
 */

/**
 * Crée un identifiant unique pour une opération.
 * @return {string} ID unique.
 */
function generateOperationId() {
  return "OP-" + new Date().getTime();
}

/**
 * Crée un identifiant unique pour une réservation.
 * @return {string} ID unique.
 */
function generateReservationId() {
  return "RES-" + new Date().getTime();
}

/**
 * Crée un identifiant unique pour un article.
 * @return {string} ID unique.
 */
function generateArticleId() {
  return "ART-" + Utilities.getUuid().substring(0, 8);
}

/**
 * Formate une date pour l'affichage.
 * @param {Date} date - Date à formater.
 * @param {string} format - Format de sortie (ex: "dd/MM/yyyy").
 * @return {string} Date formatée.
 */
function formatDate(date, format) {
  if (!date) return "";
  return Utilities.formatDate(date, Config.TIMEZONE, format);
}

/**
 * Convertit une valeur en Date si ce n'est pas déjà le cas.
 * @param {Date|string} value - Valeur à convertir.
 * @return {Date|null} Date ou null si invalide.
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    return new Date(value);
  } catch (e) {
    return null;
  }
}
