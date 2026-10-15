// Point d'entrée de l'application (doGet) et petits outils communs à tous les fichiers.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Application_() {
  return "2026.10.15-1339";
}

function doGet() {
  // Fichier manquant ou resté à l'ancienne version : on n'ouvre pas une application à moitié
  const problemes = problemesInstallation_();
  if (problemes.length) return pageInstallationIncomplete_(problemes);
  // Nouveau classeur : onglets créés à la première ouverture (rien n'est écrasé)
  try {
    if (feuillesManquantes_().length) avecVerrou_(installerFeuilles_);
  } catch (e) {
    Logger.log("Création des onglets impossible : " + e);
  }
  const page = HtmlService.createTemplateFromFile("Index");
  // Offres et réservations glissées dans la page : affichage immédiat, sans appel au serveur
  page.copieJson = jsonPourPage_(copieSure_());
  return page
    .evaluate()
    .setTitle("Application de Réservations")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Morceaux de la page (Style.html, Script*.html), insérés tels quels dans Index.html
// par <?!= include_('Nom') ?>. Ils ne contiennent aucune balise de modèle (<? ?>).
// Le « _ » final la rend inaccessible depuis la page (google.script.run).
function include_(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

// Fuseau horaire de référence (réglage du projet Apps Script).
function fuseau_() {
  try {
    return Session.getScriptTimeZone() || "Europe/Paris";
  } catch (e) {
    return "Europe/Paris";
  }
}

// Exécute une écriture sous verrou pour éviter que deux postes se marchent dessus.
function avecVerrou_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("L'application est occupée, veuillez réessayer dans quelques secondes.");
  }
  try {
    return fn();
  } finally {
    // Écritures envoyées au tableur avant de rendre le verrou (l'appel suivant les lit)
    try {
      SpreadsheetApp.flush();
    } catch (e) {}
    lock.releaseLock();
  }
}

// Force l'enregistrement en texte : garde le 0 des téléphones et empêche l'interprétation
// en formule (=, +, -). L'apostrophe initiale est invisible dans le Sheet.
function texte_(valeur) {
  const s = String(valeur == null ? "" : valeur).trim();
  return s ? "'" + s : "";
}

// Formate une cellule date sans planter si elle contient du texte
function formaterDate_(valeur, format) {
  if (!valeur) return "";
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (isNaN(d.getTime())) return String(valeur);
  return Utilities.formatDate(d, fuseau_(), format);
}

// Les anciens téléphones enregistrés en nombre ont perdu leur 0 initial
function formaterContact_(valeur) {
  if (typeof valeur === "number") {
    const s = String(valeur);
    return s.length === 9 ? "0" + s : s;
  }
  return String(valeur || "");
}

// Identifiant unique : préfixe + heure + 4 caractères au hasard (deux enregistrements dans
// la même milliseconde, sur deux postes, ne peuvent plus recevoir le même identifiant).
function nouvelId_(prefixe) {
  return prefixe + "-" + new Date().getTime() + "-" + Utilities.getUuid().substring(0, 4);
}

function feuille_(nomFeuille) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) throw new Error("Onglet « " + nomFeuille + " » introuvable dans le Google Sheets.");
  return feuille;
}

// Lignes d'un onglet sans l'en-tête
function lignes_(nomFeuille) {
  return feuille_(nomFeuille).getDataRange().getValues().slice(1);
}

// Réécrit un onglet en une fois en ne gardant que les lignes voulues (beaucoup plus rapide
// que de supprimer les lignes une à une). Les textes sont réécrits en texte (apostrophe :
// le 0 d'un téléphone ou un « = » restent tels quels). Renvoie le nombre de lignes retirées.
function reecrire_(feuille, garder) {
  const valeurs = feuille.getDataRange().getValues();
  const corps = valeurs.slice(1);
  const gardees = corps.filter(garder);
  if (gardees.length === corps.length) return 0;
  const nbColonnes = valeurs[0].length;
  feuille.getRange(2, 1, corps.length, nbColonnes).clearContent();
  if (gardees.length) {
    feuille.getRange(2, 1, gardees.length, nbColonnes).setValues(
      gardees.map(function (row) {
        return row.map(function (v) {
          return typeof v === "string" && v !== "" ? "'" + v : v;
        });
      })
    );
  }
  return corps.length - gardees.length;
}
