// Contrôle de l'installation : tous les fichiers présents et au même numéro de version,
// sinon page « Installation incomplète » au lieu d'une application à moitié à jour.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Installation_() {
  return "2026.10.15-1026";
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
