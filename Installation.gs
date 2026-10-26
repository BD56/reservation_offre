// Installation : onglets et colonnes du Google Sheets créés par le code (rien n'est jamais
// écrasé), réglages hérités d'une copie effacés (nettoyerSiCopie_), menu du Sheet, et contrôle « tous les fichiers présents et au même numéro de
// version » (sinon page « Installation incomplète » au lieu d'une application à moitié à jour).

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Installation_() {
  return "2026.10.26-1645";
}

// Liste des problèmes (vide si tout va bien). La version de référence est celle de ce fichier.
function verifierInstallation_() {
  const attendue = version_Installation_();
  const problemes = [];
  FICHIERS_SERVEUR.forEach(function (nom) {
    const f = globalThis["version_" + nom + "_"];
    if (typeof f !== "function") problemes.push(nom + ".gs : absent (ou sans numéro de version)");
    else if (f() !== attendue) problemes.push(nom + ".gs : version " + f() + " au lieu de " + attendue);
  });
  FICHIERS_PAGE.forEach(function (nom) {
    let contenu;
    try {
      contenu = HtmlService.createHtmlOutputFromFile(nom).getContent();
    } catch (e) {
      // Index.html sert de témoin : s'il est illisible, c'est le contrôle qui est en panne
      // (pas tous les fichiers absents) -> erreur, et l'application s'ouvre quand même.
      if (nom === "Index") throw e;
      problemes.push(nom + ".html : absent");
      return;
    }
    // Marque en attribut data-version="…" (les commentaires <!-- --> sont retirés par Apps Script)
    const m = /data-version=(?:"|'|&quot;)?([\w.-]+)/.exec(contenu);
    if (!m) {
      if (nom === "Index") throw new Error("Index.html sans marque de version lisible");
      problemes.push(nom + ".html : sans numéro de version");
    } else if (m[1] !== attendue) problemes.push(nom + ".html : version " + m[1] + " au lieu de " + attendue);
  });
  return problemes;
}

// Une panne du contrôle lui-même ne bloque jamais l'accueil : application ouverte quand même.
function problemesInstallation_() {
  try {
    return verifierInstallation_();
  } catch (e) {
    Logger.log("Contrôle de l'installation impossible : " + e);
    return [];
  }
}

// Page affichée à la place de l'application.
function pageInstallationIncomplete_(problemes) {
  const esc = function (t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  const html =
    '<div style="font-family: sans-serif; max-width: 520px; margin: 40px auto; padding: 0 16px;">' +
    "<h2>⚠️ Installation incomplète</h2>" +
    "<p>L'application n'a pas été entièrement mise à jour : elle ne peut pas être utilisée " +
    "dans cet état.</p>" +
    "<ul><li>" +
    problemes.map(esc).join("</li><li>") +
    "</li></ul>" +
    "<p>Prévenez le responsable : il doit recopier les fichiers indiqués puis redéployer.</p>" +
    "</div>";
  return HtmlService.createHtmlOutput(html).setTitle("Installation incomplète");
}

// --- Onglets et colonnes du Google Sheets ---
function feuillesManquantes_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return Object.keys(ENTETES).filter(function (nom) {
    return !ss.getSheetByName(nom);
  });
}

// Crée les onglets manquants et complète une ligne d'en-tête vide ou incomplète. Une cellule
// d'en-tête déjà remplie n'est jamais modifiée, et aucune donnée n'est touchée.
// Renvoie la liste de ce qui a été fait.
function installerFeuilles_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const faits = [];
  Object.keys(ENTETES).forEach(function (nom, position) {
    const entetes = ENTETES[nom];
    let feuille = ss.getSheetByName(nom);
    if (!feuille) {
      feuille = ss.insertSheet(nom, position);
      feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight("bold");
      feuille.setFrozenRows(1);
      FORMATS_DATES[nom].forEach(function (f) {
        const lettre = String.fromCharCode(64 + f[0]); // colonne entière, lignes futures comprises
        feuille.getRange(lettre + "2:" + lettre).setNumberFormat(f[1]);
      });
      faits.push("Onglet « " + nom + " » créé.");
      return;
    }
    const ligne1 = feuille.getRange(1, 1, 1, entetes.length).getValues()[0];
    const manquantes = [];
    entetes.forEach(function (titre, i) {
      if (String(ligne1[i] == null ? "" : ligne1[i]).trim() === "") {
        feuille
          .getRange(1, i + 1)
          .setValue(titre)
          .setFontWeight("bold");
        manquantes.push(titre);
      }
    });
    if (manquantes.length)
      faits.push("Onglet « " + nom + " » : colonnes ajoutées (" + manquantes.join(", ") + ").");
  });
  return faits;
}

// Installation complète (idempotente) : onglets, colonnes, contrôle des fichiers.
function installer_() {
  const copie = avecVerrou_(nettoyerSiCopie_);
  const rapport = installerFeuilles_();
  if (copie) rapport.unshift("Copie d'un autre classeur : réglages hérités effacés (données intactes).");
  PropertiesService.getDocumentProperties().setProperty("SCHEMA", SCHEMA);
  let problemes = [];
  try {
    problemes = verifierInstallation_();
  } catch (e) {
    rapport.push("Contrôle des fichiers impossible : " + e.message);
  }
  if (problemes.length) {
    rapport.unshift("⚠️ INSTALLATION INCOMPLÈTE (l'application est bloquée) :\n- " + problemes.join("\n- "));
  }
  if (!rapport.length) rapport.push("Rien à faire : tout est déjà en place.");
  rapport.push("Version " + version_Installation_() + ".");
  Logger.log(rapport.join("\n"));
  return rapport.join("\n");
}

// Menu du Google Sheets → « 🧰 Installer / vérifier l'installation »
function installerDepuisMenu() {
  const ui = SpreadsheetApp.getUi(); // échoue hors du Google Sheets : rien n'est fait
  ui.alert(
    "🧰 Installation",
    installer_() +
      "\n\nSi l'application n'est pas encore en ligne : Extensions → Apps Script → " +
      "Déployer → Nouveau déploiement → Application Web.",
    ui.ButtonSet.OK
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 APPLICATION")
    .addItem("🧰 Installer / vérifier l'installation", "installerDepuisMenu")
    .addToUi();
}
