// Réglages du magasin (nom avec l'article, titre de l'onglet), modifiables dans
// l'application (⚙️ Réglages), sans code : rien de sensible. Stockés dans les propriétés
// du classeur (clés CFG_*), marquées avec son identifiant : une copie du classeur (modèle
// vierge → nouveau magasin) repart des valeurs par défaut.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Reglages_() {
  return "2026.10.26-1645";
}

// Clé absente = valeur par défaut (l'existant : Carrefour Vannes)
const REGLAGES_DEFAUTS = {
  NOM_MAGASIN: "l'Hypermarché Carrefour Vannes", // avec l'article : lu « L'auteur concède à … »
  TITRE_APP: "Application de Réservations", // titre de l'onglet du navigateur
};
const REGLAGES_MAX = 80; // caractères

function reglages_() {
  const props = PropertiesService.getDocumentProperties().getProperties();
  const r = {};
  Object.keys(REGLAGES_DEFAUTS).forEach(function (k) {
    const v = props["CFG_" + k];
    r[k] = v === undefined || v === null || v === "" ? REGLAGES_DEFAUTS[k] : v;
  });
  return r;
}

// Appelée par la page (⚙️ Réglages). Seules les clés connues sont acceptées, jamais vides.
// Renvoie les réglages enregistrés.
function enregistrerReglages(valeurs) {
  const aEcrire = {};
  Object.keys(REGLAGES_DEFAUTS).forEach(function (k) {
    if (!valeurs || !(k in valeurs)) return;
    const v = String(valeurs[k] == null ? "" : valeurs[k])
      .replace(/\s+/g, " ")
      .trim();
    if (!v) throw new Error("Le nom du magasin et le titre ne peuvent pas être vides.");
    if (v.length > REGLAGES_MAX) throw new Error(REGLAGES_MAX + " caractères au maximum.");
    aEcrire["CFG_" + k] = v;
  });
  avecVerrou_(function () {
    nettoyerSiCopie_(); // jamais un réglage écrit avant le nettoyage d'une copie
    PropertiesService.getDocumentProperties().setProperties(aEcrire);
  });
  return reglages_();
}

// Copie d'un autre classeur (le modèle, ou un autre magasin) : propriétés héritées effacées
// (réglages, version du schéma), données jamais touchées. Le classeur est marqué avec son
// identifiant à la première installation ou ouverture. Renvoie vrai si une copie a été
// nettoyée.
function nettoyerSiCopie_() {
  const props = PropertiesService.getDocumentProperties();
  const id = SpreadsheetApp.getActiveSpreadsheet().getId();
  const marque = props.getProperty("ID_CLASSEUR");
  if (marque === id) return false;
  if (marque) props.deleteAllProperties();
  props.setProperty("ID_CLASSEUR", id);
  return !!marque;
}
