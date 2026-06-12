/**
 * Service d'accès aux feuilles Google Sheets.
 * Centralise toutes les opérations de lecture/écriture pour éviter la duplication de code.
 */

/**
 * Récupère les données d'une feuille.
 * @param {string} sheetName - Nom de la feuille.
 * @return {Array[]} Tableau 2D des données (ou tableau vide si la feuille n'existe pas).
 */
function getSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.error(`Feuille "${sheetName}" introuvable.`);
    return [];
  }
  return sheet.getDataRange().getValues();
}

/**
 * Récupère les données d'une feuille sans l'en-tête.
 * @param {string} sheetName - Nom de la feuille.
 * @return {Array[]} Tableau 2D des données (sans la première ligne).
 */
function getSheetDataWithoutHeader(sheetName) {
  const data = getSheetData(sheetName);
  return data.length > 0 ? data.slice(1) : [];
}

/**
 * Ajoute une ligne à une feuille.
 * @param {string} sheetName - Nom de la feuille.
 * @param {Array} rowData - Données de la ligne à ajouter.
 * @return {boolean} True si l'ajout a réussi.
 */
function appendRow(sheetName, rowData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.error(`Feuille "${sheetName}" introuvable.`);
    return false;
  }
  sheet.appendRow(rowData);
  return true;
}

/**
 * Supprime une ligne d'une feuille par son index.
 * @param {string} sheetName - Nom de la feuille.
 * @param {number} rowIndex - Index de la ligne à supprimer (1-based).
 * @return {boolean} True si la suppression a réussi.
 */
function deleteRow(sheetName, rowIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.error(`Feuille "${sheetName}" introuvable.`);
    return false;
  }
  if (rowIndex < 1 || rowIndex > sheet.getLastRow()) {
    console.error(`Index de ligne invalide : ${rowIndex}`);
    return false;
  }
  sheet.deleteRow(rowIndex);
  return true;
}

/**
 * Met à jour une cellule ou une plage de cellules.
 * @param {string} sheetName - Nom de la feuille.
 * @param {number} row - Ligne (1-based).
 * @param {number} col - Colonne (1-based).
 * @param {any} value - Valeur à définir.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateCell(sheetName, row, col, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.error(`Feuille "${sheetName}" introuvable.`);
    return false;
  }
  sheet.getRange(row, col).setValue(value);
  return true;
}

/**
 * Met à jour une plage de cellules.
 * @param {string} sheetName - Nom de la feuille.
 * @param {number} row - Ligne de départ (1-based).
 * @param {number} col - Colonne de départ (1-based).
 * @param {number} numRows - Nombre de lignes.
 * @param {number} numCols - Nombre de colonnes.
 * @param {Array[]} values - Tableau 2D des valeurs à définir.
 * @return {boolean} True si la mise à jour a réussi.
 */
function updateRange(sheetName, row, col, numRows, numCols, values) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.error(`Feuille "${sheetName}" introuvable.`);
    return false;
  }
  sheet.getRange(row, col, numRows, numCols).setValues(values);
  return true;
}

/**
 * Trouve l'index d'une ligne par la valeur d'une colonne.
 * @param {string} sheetName - Nom de la feuille.
 * @param {number} colIndex - Index de la colonne à rechercher (0-based).
 * @param {string} searchValue - Valeur à rechercher.
 * @return {number|null} Index de la ligne (1-based) ou null si non trouvé.
 */
function findRowIndexByColumnValue(sheetName, colIndex, searchValue) {
  const data = getSheetData(sheetName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim() === String(searchValue).trim()) {
      return i + 1; // 1-based
    }
  }
  return null;
}

/**
 * Trouve toutes les lignes correspondant à une valeur dans une colonne.
 * @param {string} sheetName - Nom de la feuille.
 * @param {number} colIndex - Index de la colonne à rechercher (0-based).
 * @param {string} searchValue - Valeur à rechercher.
 * @return {number[]} Tableau d'index de lignes (1-based).
 */
function findAllRowIndexesByColumnValue(sheetName, colIndex, searchValue) {
  const data = getSheetData(sheetName);
  const indexes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim() === String(searchValue).trim()) {
      indexes.push(i + 1); // 1-based
    }
  }
  return indexes;
}

/**
 * Vérifie si une feuille existe.
 * @param {string} sheetName - Nom de la feuille.
 * @return {boolean} True si la feuille existe.
 */
function sheetExists(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(sheetName) !== null;
}
