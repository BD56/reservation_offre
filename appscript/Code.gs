/**
 * Configuration centrale pour le projet reservation_offre.
 */
const Config = {
  SHEET_OPERATIONS: "Operations",
  SHEET_RESERVATIONS: "Reservations",
  SHEET_ARTICLES: "Articles",
  COL_OPERATION_ID: 0,
  COL_OPERATION_NOM: 1,
  COL_OPERATION_TYPE: 2,
  COL_OPERATION_DATE_DEBUT: 3,
  COL_OPERATION_DATE_FIN: 4,
  COL_OPERATION_MODE_SAISIE: 5,
  COL_OPERATION_ARTICLES_PREDEFINIS: 6,
  COL_RESERVATION_ID: 0,
  COL_RESERVATION_OPERATION_ID: 1,
  COL_RESERVATION_NOM: 2,
  COL_RESERVATION_PRENOM: 3,
  COL_RESERVATION_CONTACT: 4,
  COL_RESERVATION_ETAT: 5,
  COL_RESERVATION_DATE_SAISIE: 6,
  COL_ARTICLE_ID: 0,
  COL_ARTICLE_RESERVATION_ID: 1,
  COL_ARTICLE_NOM: 2,
  COL_ARTICLE_QUANTITE: 3,
  RESERVATION_STATUSES: ["Réservé", "Contacté", "Retrait", "Annulé"],
  OPERATION_TYPES: ["Produit", "Evenement"],
  OPERATION_MODES: ["Libre", "Predefini"],
  DATE_FORMAT_DISPLAY: "dd/MM/yyyy",
  DATE_FORMAT_INPUT: "yyyy-MM-dd",
  DATETIME_FORMAT_DISPLAY: "dd/MM/yyyy HH:mm",
  TIMEZONE: Session.getScriptTimeZone()
};

/**
 * Génère des IDs uniques.
 */
function generateOperationId() { return "OP-" + new Date().getTime(); }
function generateReservationId() { return "RES-" + new Date().getTime(); }
function generateArticleId() { return "ART-" + Utilities.getUuid().substring(0, 8); }

/**
 * Formate une date.
 */
function formatDate(date, format) {
  if (!date) return "";
  return Utilities.formatDate(date, Config.TIMEZONE, format);
}

/**
 * Convertit une valeur en Date.
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  try { return new Date(value); } catch (e) { return null; }
}

/**
 * Service d'accès aux feuilles Google Sheets.
 */
function getSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { console.error(`Feuille "${sheetName}" introuvable.`); return []; }
  return sheet.getDataRange().getValues();
}

function getSheetDataWithoutHeader(sheetName) {
  const data = getSheetData(sheetName);
  return data.length > 0 ? data.slice(1) : [];
}

function appendRow(sheetName, rowData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { console.error(`Feuille "${sheetName}" introuvable.`); return false; }
  sheet.appendRow(rowData);
  return true;
}

function deleteRow(sheetName, rowIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { console.error(`Feuille "${sheetName}" introuvable.`); return false; }
  if (rowIndex < 1 || rowIndex > sheet.getLastRow()) { console.error(`Index de ligne invalide : ${rowIndex}`); return false; }
  sheet.deleteRow(rowIndex);
  return true;
}

function updateCell(sheetName, row, col, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { console.error(`Feuille "${sheetName}" introuvable.`); return false; }
  sheet.getRange(row, col).setValue(value);
  return true;
}

function updateRange(sheetName, row, col, numRows, numCols, values) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) { console.error(`Feuille "${sheetName}" introuvable.`); return false; }
  sheet.getRange(row, col, numRows, numCols).setValues(values);
  return true;
}

function findRowIndexByColumnValue(sheetName, colIndex, searchValue) {
  const data = getSheetData(sheetName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim() === String(searchValue).trim()) {
      return i + 1;
    }
  }
  return null;
}

function findAllRowIndexesByColumnValue(sheetName, colIndex, searchValue) {
  const data = getSheetData(sheetName);
  const indexes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim() === String(searchValue).trim()) {
      indexes.push(i + 1);
    }
  }
  return indexes;
}

/**
 * Service de gestion des opérations.
 */
function getAllOperationsWithCounts() {
  const opsData = getSheetDataWithoutHeader(Config.SHEET_OPERATIONS);
  const resData = getSheetDataWithoutHeader(Config.SHEET_RESERVATIONS);
  const reservationCounts = {};
  resData.forEach(row => {
    const opId = String(row[Config.COL_RESERVATION_OPERATION_ID]).trim();
    if (opId) { reservationCounts[opId] = (reservationCounts[opId] || 0) + 1; }
  });
  return opsData
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
}

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

function createOperation(data) {
  const newId = generateOperationId();
  const rowData = [newId, data.nom, data.type, data.dateDebut || "", data.dateFin || "", data.modeSaisie || "Libre", data.articlesPredefinis || ""];
  appendRow(Config.SHEET_OPERATIONS, rowData);
  return { id: newId, nom: data.nom, type: data.type, dateDebut: toDate(data.dateDebut), dateFin: toDate(data.dateFin), modeSaisie: data.modeSaisie || "Libre", articlesPredefinis: data.articlesPredefinis || "" };
}

function updateOperation(data) {
  const rowIndex = findRowIndexByColumnValue(Config.SHEET_OPERATIONS, Config.COL_OPERATION_ID, data.id);
  if (!rowIndex) { throw new Error(`Opération avec l'ID "${data.id}" introuvable.`); }
  const rowData = [[data.nom, data.type, data.dateDebut || "", data.dateFin || "", data.modeSaisie || "Libre", data.articlesPredefinis || ""]];
  return updateRange(Config.SHEET_OPERATIONS, rowIndex, Config.COL_OPERATION_NOM + 1, 1, 6, rowData);
}

function deleteOperationWithCascade(operationId) {
  const opRowIndex = findRowIndexByColumnValue(Config.SHEET_OPERATIONS, Config.COL_OPERATION_ID, operationId);
  if (!opRowIndex) { throw new Error(`Opération avec l'ID "${operationId}" introuvable.`); }
  deleteRow(Config.SHEET_OPERATIONS, opRowIndex);
  const resRowIndexes = findAllRowIndexesByColumnValue(Config.SHEET_RESERVATIONS, Config.COL_RESERVATION_OPERATION_ID, operationId);
  const reservationIdsToDelete = [];
  resRowIndexes.forEach(rowIndex => {
    const resData = getSheetData(Config.SHEET_RESERVATIONS);
    const resId = String(resData[rowIndex - 1][Config.COL_RESERVATION_ID]).trim();
    reservationIdsToDelete.push(resId);
    deleteRow(Config.SHEET_RESERVATIONS, rowIndex);
  });
  if (reservationIdsToDelete.length > 0) {
    reservationIdsToDelete.forEach(resId => {
      const artRowIndexes = findAllRowIndexesByColumnValue(Config.SHEET_ARTICLES, Config.COL_ARTICLE_RESERVATION_ID, resId);
      artRowIndexes.forEach(rowIndex => { deleteRow(Config.SHEET_ARTICLES, rowIndex); });
    });
  }
  return true;
}

/**
 * Service de gestion des réservations.
 */
function createReservation(data) {
  const reservationId = generateReservationId();
  let contact = data.telephone || "";
  if (data.email) { contact += (contact ? " / " : "") + data.email; }
  const dateSaisie = formatDate(new Date(), Config.DATETIME_FORMAT_DISPLAY);
  const resRowData = [reservationId, data.operationId, data.nom, data.prenom, contact, "Réservé", dateSaisie];
  appendRow(Config.SHEET_RESERVATIONS, resRowData);
  if (data.articles && data.articles.length > 0) {
    data.articles.forEach(art => {
      const artId = generateArticleId();
      appendRow(Config.SHEET_ARTICLES, [artId, reservationId, art.nom, art.quantite]);
    });
  }
  return { id: reservationId, operationId: data.operationId, nom: data.nom, prenom: data.prenom, contact: contact, etat: "Réservé", dateSaisie: dateSaisie };
}

function getReservationsByOperation(operationId) {
  const resData = getSheetDataWithoutHeader(Config.SHEET_RESERVATIONS);
  const reservations = [];
  resData.forEach(row => {
    if (String(row[Config.COL_RESERVATION_OPERATION_ID]).trim() === String(operationId).trim()) {
      const dateSaisie = row[Config.COL_RESERVATION_DATE_SAISIE];
      const formattedDateSaisie = (dateSaisie instanceof Date) ? formatDate(dateSaisie, Config.DATETIME_FORMAT_DISPLAY) : String(dateSaisie || "");
      reservations.push({
        idRes: String(row[Config.COL_RESERVATION_ID]).trim(),
        nom: String(row[Config.COL_RESERVATION_NOM] || ""),
        prenom: String(row[Config.COL_RESERVATION_PRENOM] || ""),
        contact: String(row[Config.COL_RESERVATION_CONTACT] || ""),
        etat: String(row[Config.COL_RESERVATION_ETAT] || "Réservé"),
        dateSaisie: formattedDateSaisie,
        articlesText: ""
      });
    }
  });
  return reservations;
}

function updateReservationStatus(reservationId, newStatus) {
  if (!Config.RESERVATION_STATUSES.includes(newStatus)) {
    throw new Error(`Statut invalide : "${newStatus}". Statuts valides : ${Config.RESERVATION_STATUSES.join(", ")}`);
  }
  const rowIndex = findRowIndexByColumnValue(Config.SHEET_RESERVATIONS, Config.COL_RESERVATION_ID, reservationId);
  if (!rowIndex) { throw new Error(`Réservation avec l'ID "${reservationId}" introuvable.`); }
  return updateCell(Config.SHEET_RESERVATIONS, rowIndex, Config.COL_RESERVATION_ETAT + 1, newStatus);
}

function getArticlesByReservation(reservationId) {
  const artData = getSheetDataWithoutHeader(Config.SHEET_ARTICLES);
  const articles = [];
  artData.forEach(row => {
    if (String(row[Config.COL_ARTICLE_RESERVATION_ID]).trim() === String(reservationId).trim()) {
      articles.push({
        id: String(row[Config.COL_ARTICLE_ID]).trim(),
        reservationId: String(row[Config.COL_ARTICLE_RESERVATION_ID]).trim(),
        nom: String(row[Config.COL_ARTICLE_NOM] || ""),
        quantite: parseInt(row[Config.COL_ARTICLE_QUANTITE]) || 0
      });
    }
  });
  return articles;
}

function getResumeArticlesByOperation(operationId) {
  const reservations = getReservationsByOperation(operationId);
  const resumeArticles = {};
  reservations.forEach(res => {
    const articles = getArticlesByReservation(res.idRes);
    articles.forEach(art => {
      const nomArt = art.nom.trim();
      if (nomArt) { resumeArticles[nomArt] = (resumeArticles[nomArt] || 0) + art.quantite; }
    });
  });
  const result = Object.keys(resumeArticles).map(nom => ({ nom: nom, total: resumeArticles[nom] }));
  result.sort((a, b) => a.nom.localeCompare(b.nom));
  return result;
}

/**
 * Points d'entrée principaux.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Application de Réservations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getOperationsData() {
  try {
    const operations = getAllOperationsWithCounts();
    return operations.map(op => ({
      id: op.id, nom: op.nom, type: op.type,
      dateDebut: op.dateDebut ? formatDate(op.dateDebut, Config.DATE_FORMAT_DISPLAY) : "",
      dateFin: op.dateFin ? formatDate(op.dateFin, Config.DATE_FORMAT_DISPLAY) : "",
      modeSaisie: op.modeSaisie, articlesPredefinis: op.articlesPredefinis, count: op.count
    }));
  } catch (e) { throw new Error("Impossible de récupérer les opérations : " + e.message); }
}

function saveReservation(data) {
  try { createReservation(data); return true; }
  catch (e) { throw new Error("Impossible de sauvegarder la réservation : " + e.message); }
}

function getOperationDetails(operationId) {
  try {
    const operation = getOperationById(operationId);
    if (!operation) { throw new Error(`Opération avec l'ID "${operationId}" introuvable.`); }
    const reservations = getReservationsByOperation(operationId);
    const resume = getResumeArticlesByOperation(operationId);
    reservations.forEach(res => {
      const articles = getArticlesByReservation(res.idRes);
      res.articlesText = articles.length > 0 ? articles.map(art => `${art.quantite}x ${art.nom}`).join(', ') : '';
    });
    return {
      operation: {
        id: operation.id, nom: operation.nom, type: operation.type,
        dateDebut: operation.dateDebut ? formatDate(operation.dateDebut, Config.DATE_FORMAT_INPUT) : "",
        dateFin: operation.dateFin ? formatDate(operation.dateFin, Config.DATE_FORMAT_INPUT) : "",
        modeSaisie: operation.modeSaisie, articlesPredefinis: operation.articlesPredefinis
      },
      reservations: reservations, resume: resume
    };
  } catch (e) { throw new Error("Impossible de récupérer les détails : " + e.message); }
}

function saveOperation(data) {
  try { createOperation(data); return true; }
  catch (e) { throw new Error("Impossible de sauvegarder l'opération : " + e.message); }
}

function updateOperation(data) {
  try { return updateOperation(data); }
  catch (e) { throw new Error("Impossible de mettre à jour l'opération : " + e.message); }
}

function deleteOperation(operationId) {
  try { return deleteOperationWithCascade(operationId); }
  catch (e) { throw new Error("Impossible de supprimer l'opération : " + e.message); }
}

function updateReservationStatus(reservationId, newStatus) {
  try { return updateReservationStatus(reservationId, newStatus); }
  catch (e) { throw new Error("Impossible de mettre à jour le statut : " + e.message); }
}
