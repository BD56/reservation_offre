/**
 * Service de gestion des opérations (offres).
 * Contient toute la logique métier liée aux opérations.
 */

/**
 * Récupère toutes les opérations avec leur nombre de réservations associées.
 * @return {Operation[]} Tableau d'opérations.
 */
function getAllOperationsWithCounts() {
  const opsData = getSheetDataWithoutHeader(Config.SHEET_OPERATIONS);
  const resData = getSheetDataWithoutHeader(Config.SHEET_RESERVATIONS);

  // Compter les réservations par opération
  const reservationCounts = {};
  resData.forEach(row => {
    const opId = String(row[Config.COL_RESERVATION_OPERATION_ID]).trim();
    if (opId) {
      reservationCounts[opId] = (reservationCounts[opId] || 0) + 1;
    }
  });

  // Convertir les données en objets Operation
  const operations = opsData
    .filter(row => String(row[Config.COL_OPERATION_ID]).trim() !== "")
    .map(row => ({
      id: String(row[Config.COL_OPERATION_ID]).trim(),
      nom: String(row[Config.COL_OPERATION_NOM] || ""),
      type: String(row[Config.COL_OPERATION_TYPE] || ""),
      dateDebut: toDate(row[Config.COL_OPERATION_DATE_DEBUT]),
      dateFin: toDate(row[Config.COL_OPERATION_DATE_FIN]),
      modeSaisie: String(row[Config.COL_OPERATION_MODE_SAISIE] || "Libre"),
      articlesPredefinis: String(row[Config.COL_OPERATION_ARTICLES_PREDEFINIS] || ""),
      count: reservationCounts[String(row[Config.COL_OPERATION_ID]).trim()] || 0
    }));

  return operations;
}

/**
 * Récupère une opération par son ID.
 * @param {string} operationId - ID de l'opération.
 * @return {Operation|null} Opération ou null si non trouvée.
 */
function getOperationById(operationId) {
  const opsData = getSheetDataWithoutHeader(Config.SHEET_OPERATIONS);
  for (const row of opsData) {
    if (String(row[Config.COL_OPERATION_ID]).trim() === String(operationId).trim()) {
      return {
        id: String(row[Config.COL_OPERATION_ID]).trim(),
        nom: String(row[Config.COL_OPERATION_NOM] || ""),
        type: String(row[Config.COL_OPERATION_TYPE] || ""),
        dateDebut: toDate(row[Config.COL_OPERATION_DATE_DEBUT]),
        dateFin: toDate(row[Config.COL_OPERATION_DATE_FIN]),
        modeSaisie: String(row[Config.COL_OPERATION_MODE_SAISIE] || "Libre"),
        articlesPredefinis: String(row[Config.COL_OPERATION_ARTICLES_PREDEFINIS] || "")
      };
    }
  }
  return null;
}

/**
 * Crée une nouvelle opération.
 * @param {Object} data - Données de l'opération à créer.
 * @param {string} data.nom - Nom de l'opération.
 * @param {string} data.type - Type de l'opération.
 * @param {string} [data.dateDebut] - Date de début (format YYYY-MM-DD).
 * @param {string} [data.dateFin] - Date de fin (format YYYY-MM-DD).
 * @param {string} [data.modeSaisie] - Mode de saisie.
 * @param {string} [data.articlesPredefinis] - Articles prédéfinis.
 * @return {Operation} Opération créée.
 */
function createOperation(data) {
  const newId = generateOperationId();
  const rowData = [
    newId,
    data.nom,
    data.type,
    data.dateDebut || "",
    data.dateFin || "",
    data.modeSaisie || "Libre",
    data.articlesPredefinis || ""
  ];

  appendRow(Config.SHEET_OPERATIONS, rowData);

  return {
    id: newId,
    nom: data.nom,
    type: data.type,
    dateDebut: toDate(data.dateDebut),
    dateFin: toDate(data.dateFin),
    modeSaisie: data.modeSaisie || "Libre",
    articlesPredefinis: data.articlesPredefinis || ""
  };
}

/**
 * Met à jour une opération existante.
 * @param {Object} data - Données de l'opération à mettre à jour.
 * @param {string} data.id - ID de l'opération.
 * @param {string} data.nom - Nom de l'opération.
 * @param {string} data.type - Type de l'opération.
 * @param {string} [data.dateDebut] - Date de début (format YYYY-MM-DD).
 * @param {string} [data.dateFin] - Date de fin (format YYYY-MM-DD).
 * @param {string} [data.modeSaisie] - Mode de saisie.
 * @param {string} [data.articlesPredefinis] - Articles prédéfinis.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateOperation(data) {
  const rowIndex = findRowIndexByColumnValue(
    Config.SHEET_OPERATIONS,
    Config.COL_OPERATION_ID,
    data.id
  );

  if (!rowIndex) {
    throw new Error(`Opération avec l'ID "${data.id}" introuvable.`);
  }

  const rowData = [
    data.nom,
    data.type,
    data.dateDebut || "",
    data.dateFin || "",
    data.modeSaisie || "Libre",
    data.articlesPredefinis || ""
  ];

  // Mettre à jour les colonnes 2 à 7 (B à G)
  return updateRange(
    Config.SHEET_OPERATIONS,
    rowIndex,
    Config.COL_OPERATION_NOM + 1, // +1 car 1-based
    1,
    6,
    [rowData]
  );
}

/**
 * Supprime une opération et toutes ses réservations/articles associés (suppression en cascade).
 * @param {string} operationId - ID de l'opération à supprimer.
 * @return {boolean} True si la suppression a réussi.
 */
function deleteOperationWithCascade(operationId) {
  // 1. Supprimer l'opération
  const opRowIndex = findRowIndexByColumnValue(
    Config.SHEET_OPERATIONS,
    Config.COL_OPERATION_ID,
    operationId
  );

  if (!opRowIndex) {
    throw new Error(`Opération avec l'ID "${operationId}" introuvable.`);
  }

  deleteRow(Config.SHEET_OPERATIONS, opRowIndex);

  // 2. Trouver et supprimer les réservations associées
  const resRowIndexes = findAllRowIndexesByColumnValue(
    Config.SHEET_RESERVATIONS,
    Config.COL_RESERVATION_OPERATION_ID,
    operationId
  );

  const reservationIdsToDelete = [];
  resRowIndexes.forEach(rowIndex => {
    const resData = getSheetData(Config.SHEET_RESERVATIONS);
    const resId = String(resData[rowIndex - 1][Config.COL_RESERVATION_ID]).trim();
    reservationIdsToDelete.push(resId);
    deleteRow(Config.SHEET_RESERVATIONS, rowIndex);
  });

  // 3. Supprimer les articles associés aux réservations
  if (reservationIdsToDelete.length > 0) {
    reservationIdsToDelete.forEach(resId => {
      const artRowIndexes = findAllRowIndexesByColumnValue(
        Config.SHEET_ARTICLES,
        Config.COL_ARTICLE_RESERVATION_ID,
        resId
      );
      artRowIndexes.forEach(rowIndex => {
        deleteRow(Config.SHEET_ARTICLES, rowIndex);
      });
    });
  }

  return true;
}
