/**
 * Service de gestion des réservations.
 * Contient toute la logique métier liée aux réservations.
 */

/**
 * Crée une nouvelle réservation.
 * @param {Object} data - Données de la réservation à créer.
 * @param {string} data.operationId - ID de l'opération associée.
 * @param {string} data.nom - Nom du client.
 * @param {string} data.prenom - Prénom du client.
 * @param {string} [data.telephone] - Téléphone du client.
 * @param {string} [data.email] - Email du client.
 * @param {Array<{nom: string, quantite: number}>} [data.articles] - Liste des articles.
 * @return {Reservation} Réservation créée.
 */
function createReservation(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRes = ss.getSheetByName(Config.SHEET_RESERVATIONS);
  const sheetArt = ss.getSheetByName(Config.SHEET_ARTICLES);

  // Générer l'ID de la réservation
  const reservationId = generateReservationId();

  // Formater le contact
  let contact = data.telephone || "";
  if (data.email) {
    contact += (contact ? " / " : "") + data.email;
  }

  // Formater la date de saisie
  const dateSaisie = formatDate(new Date(), Config.DATETIME_FORMAT_DISPLAY);

  // Ajouter la réservation
  const resRowData = [
    reservationId,
    data.operationId,
    data.nom,
    data.prenom,
    contact,
    "Réservé", // État par défaut
    dateSaisie
  ];

  appendRow(Config.SHEET_RESERVATIONS, resRowData);

  // Ajouter les articles si présents
  if (data.articles && data.articles.length > 0) {
    data.articles.forEach(art => {
      const artId = generateArticleId();
      const artRowData = [
        artId,
        reservationId,
        art.nom,
        art.quantite
      ];
      appendRow(Config.SHEET_ARTICLES, artRowData);
    });
  }

  return {
    id: reservationId,
    operationId: data.operationId,
    nom: data.nom,
    prenom: data.prenom,
    contact: contact,
    etat: "Réservé",
    dateSaisie: dateSaisie
  };
}

/**
 * Récupère toutes les réservations associées à une opération.
 * @param {string} operationId - ID de l'opération.
 * @return {Reservation[]} Tableau de réservations.
 */
function getReservationsByOperation(operationId) {
  const resData = getSheetDataWithoutHeader(Config.SHEET_RESERVATIONS);
  const reservations = [];

  for (const row of resData) {
    if (String(row[Config.COL_RESERVATION_OPERATION_ID]).trim() === String(operationId).trim()) {
      const dateSaisie = row[Config.COL_RESERVATION_DATE_SAISIE];
      const formattedDateSaisie = (dateSaisie instanceof Date)
        ? formatDate(dateSaisie, Config.DATETIME_FORMAT_DISPLAY)
        : String(dateSaisie || "");

      reservations.push({
        idRes: String(row[Config.COL_RESERVATION_ID]).trim(),
        nom: String(row[Config.COL_RESERVATION_NOM] || ""),
        prenom: String(row[Config.COL_RESERVATION_PRENOM] || ""),
        contact: String(row[Config.COL_RESERVATION_CONTACT] || ""),
        etat: String(row[Config.COL_RESERVATION_ETAT] || "Réservé"),
        dateSaisie: formattedDateSaisie,
        articlesText: "" // Sera rempli plus tard
      });
    }
  }

  return reservations;
}

/**
 * Met à jour le statut d'une réservation.
 * @param {string} reservationId - ID de la réservation.
 * @param {string} newStatus - Nouveau statut.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateReservationStatus(reservationId, newStatus) {
  if (!Config.RESERVATION_STATUSES.includes(newStatus)) {
    throw new Error(`Statut invalide : "${newStatus}". Statuts valides : ${Config.RESERVATION_STATUSES.join(", ")}`);
  }

  const rowIndex = findRowIndexByColumnValue(
    Config.SHEET_RESERVATIONS,
    Config.COL_RESERVATION_ID,
    reservationId
  );

  if (!rowIndex) {
    throw new Error(`Réservation avec l'ID "${reservationId}" introuvable.`);
  }

  return updateCell(
    Config.SHEET_RESERVATIONS,
    rowIndex,
    Config.COL_RESERVATION_ETAT + 1, // +1 car 1-based
    newStatus
  );
}

/**
 * Récupère les articles associés à une réservation.
 * @param {string} reservationId - ID de la réservation.
 * @return {Article[]} Tableau d'articles.
 */
function getArticlesByReservation(reservationId) {
  const artData = getSheetDataWithoutHeader(Config.SHEET_ARTICLES);
  const articles = [];

  for (const row of artData) {
    if (String(row[Config.COL_ARTICLE_RESERVATION_ID]).trim() === String(reservationId).trim()) {
      articles.push({
        id: String(row[Config.COL_ARTICLE_ID]).trim(),
        reservationId: String(row[Config.COL_ARTICLE_RESERVATION_ID]).trim(),
        nom: String(row[Config.COL_ARTICLE_NOM] || ""),
        quantite: parseInt(row[Config.COL_ARTICLE_QUANTITE]) || 0
      });
    }
  }

  return articles;
}

/**
 * Calcule le résumé des quantités par article pour une opération.
 * @param {string} operationId - ID de l'opération.
 * @return {ResumeArticle[]} Résumé des articles (trié par nom).
 */
function getResumeArticlesByOperation(operationId) {
  const reservations = getReservationsByOperation(operationId);
  const resumeArticles = {};

  for (const res of reservations) {
    const articles = getArticlesByReservation(res.idRes);
    for (const art of articles) {
      const nomArt = art.nom.trim();
      if (nomArt) {
        resumeArticles[nomArt] = (resumeArticles[nomArt] || 0) + art.quantite;
      }
    }
  }

  // Convertir en tableau et trier par nom
  const result = Object.keys(resumeArticles).map(nom => ({
    nom: nom,
    total: resumeArticles[nom]
  }));

  result.sort((a, b) => a.nom.localeCompare(b.nom));

  return result;
}

/**
 * Met à jour les articles d'une réservation.
 * @param {string} reservationId - ID de la réservation.
 * @param {Array<{nom: string, quantite: number}>} articles - Nouveaux articles.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateReservationArticles(reservationId, articles) {
  // 1. Supprimer les anciens articles
  const artRowIndexes = findAllRowIndexesByColumnValue(
    Config.SHEET_ARTICLES,
    Config.COL_ARTICLE_RESERVATION_ID,
    reservationId
  );

  artRowIndexes.forEach(rowIndex => {
    deleteRow(Config.SHEET_ARTICLES, rowIndex);
  });

  // 2. Ajouter les nouveaux articles
  if (articles && articles.length > 0) {
    articles.forEach(art => {
      const artId = generateArticleId();
      const artRowData = [
        artId,
        reservationId,
        art.nom,
        art.quantite
      ];
      appendRow(Config.SHEET_ARTICLES, artRowData);
    });
  }

  return true;
}
