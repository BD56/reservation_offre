/**
 * Points d'entrée principaux pour l'application.
 * Expose les fonctions appelables depuis le frontend via google.script.run.
 */

/**
 * Point d'entrée pour l'application web.
 * @return {HtmlOutput} Output HTML pour l'interface.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('frontend/index')
    .evaluate()
    .setTitle('Application de Réservations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclut un fichier HTML/JS/CSS dans le template.
 * @param {string} filename - Nom du fichier à inclure.
 * @return {string} Contenu du fichier.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Récupère toutes les opérations avec leur nombre de réservations.
 * Appelée par le frontend pour afficher la liste des opérations.
 * @return {Operation[]} Tableau d'opérations.
 */
function getOperationsData() {
  try {
    const operations = getAllOperationsWithCounts();
    return operations.map(op => ({
      id: op.id,
      nom: op.nom,
      type: op.type,
      dateDebut: op.dateDebut ? formatDate(op.dateDebut, Config.DATE_FORMAT_DISPLAY) : "",
      dateFin: op.dateFin ? formatDate(op.dateFin, Config.DATE_FORMAT_DISPLAY) : "",
      modeSaisie: op.modeSaisie,
      articlesPredefinis: op.articlesPredefinis,
      count: op.count
    }));
  } catch (e) {
    console.error("Erreur dans getOperationsData :", e);
    throw new Error("Impossible de récupérer les opérations : " + e.message);
  }
}

/**
 * Sauvegarde une nouvelle réservation.
 * Appelée par le frontend lors de la validation du formulaire.
 * @param {Object} data - Données de la réservation.
 * @return {boolean} True si la sauvegarde a réussi.
 */
function saveReservation(data) {
  try {
    createReservation(data);
    return true;
  } catch (e) {
    console.error("Erreur dans saveReservation :", e);
    throw new Error("Impossible de sauvegarder la réservation : " + e.message);
  }
}

/**
 * Récupère les détails d'une opération (opération + réservations + résumé des articles).
 * Appelée par le frontend pour afficher les détails d'une opération.
 * @param {string} operationId - ID de l'opération.
 * @return {OperationDetails} Détails de l'opération.
 */
function getOperationDetails(operationId) {
  try {
    const operation = getOperationById(operationId);
    if (!operation) {
      throw new Error(`Opération avec l'ID "${operationId}" introuvable.`);
    }

    const reservations = getReservationsByOperation(operationId);
    const resume = getResumeArticlesByOperation(operationId);

    // Ajouter les articlesText pour chaque réservation
    reservations.forEach(res => {
      const articles = getArticlesByReservation(res.idRes);
      res.articlesText = articles.length > 0
        ? articles.map(art => `${art.quantite}x ${art.nom}`).join(', ')
        : '';
    });

    return {
      operation: {
        id: operation.id,
        nom: operation.nom,
        type: operation.type,
        dateDebut: operation.dateDebut ? formatDate(operation.dateDebut, Config.DATE_FORMAT_INPUT) : "",
        dateFin: operation.dateFin ? formatDate(operation.dateFin, Config.DATE_FORMAT_INPUT) : "",
        modeSaisie: operation.modeSaisie,
        articlesPredefinis: operation.articlesPredefinis
      },
      reservations: reservations,
      resume: resume
    };
  } catch (e) {
    console.error("Erreur dans getOperationDetails :", e);
    throw new Error("Impossible de récupérer les détails de l'opération : " + e.message);
  }
}

/**
 * Sauvegarde une nouvelle opération.
 * Appelée par le frontend lors de la création d'une offre.
 * @param {Object} data - Données de l'opération.
 * @return {boolean} True si la sauvegarde a réussi.
 */
function saveOperation(data) {
  try {
    createOperation(data);
    return true;
  } catch (e) {
    console.error("Erreur dans saveOperation :", e);
    throw new Error("Impossible de sauvegarder l'opération : " + e.message);
  }
}

/**
 * Met à jour une opération existante.
 * Appelée par le frontend lors de la modification d'une offre.
 * @param {Object} data - Données de l'opération à mettre à jour.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateOperation(data) {
  try {
    return updateOperation(data);
  } catch (e) {
    console.error("Erreur dans updateOperation :", e);
    throw new Error("Impossible de mettre à jour l'opération : " + e.message);
  }
}

/**
 * Supprime une opération et toutes ses réservations/articles associés.
 * Appelée par le frontend lors de la suppression d'une offre.
 * @param {string} operationId - ID de l'opération à supprimer.
 * @return {boolean} True si la suppression a réussi.
 */
function deleteOperation(operationId) {
  try {
    return deleteOperationWithCascade(operationId);
  } catch (e) {
    console.error("Erreur dans deleteOperation :", e);
    throw new Error("Impossible de supprimer l'opération : " + e.message);
  }
}

/**
 * Met à jour le statut d'une réservation.
 * Appelée par le frontend lors du changement de statut.
 * @param {string} reservationId - ID de la réservation.
 * @param {string} newStatus - Nouveau statut.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateReservationStatus(reservationId, newStatus) {
  try {
    return updateReservationStatus(reservationId, newStatus);
  } catch (e) {
    console.error("Erreur dans updateReservationStatus :", e);
    throw new Error("Impossible de mettre à jour le statut : " + e.message);
  }
}
