// Google Sheets : menu « 🚀 APPLICATION » et fenêtre « ⚙️ Gestion de l'application ».

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Sheet_() {
  return "2026.10.26-1833";
}

// Menu : un seul article, la fenêtre « Gestion de l'application ». Copie du modèle pas
// encore installée : un message rappelle le bouton vert de l'onglet « Démarrer ».
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 APPLICATION")
    .addItem("⚙️ Gestion de l'application", "ouvrirGestion")
    .addToUi();
  if (!estCopieNonInstallee_()) return;
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Nouvelle copie : onglet « Démarrer », bouton vert « Installer l'application ».",
      "Installation",
      20
    );
  } catch (e) {}
}

function ouvrirGestion() {
  exigerAutorisations_(); // une case oubliée à l'autorisation : Google la redemande
  exigerEditeur_();
  const page = HtmlService.createTemplateFromFile("FenetreGestion");
  page.organisation = ORGANISATION;
  SpreadsheetApp.getUi().showModalDialog(
    page.evaluate().setWidth(760).setHeight(560),
    "⚙️ Gestion de l'application"
  );
}

// Rubrique Installation → « Vérifier » : crée ce qui manque, contrôle les fichiers.
function installerDepuisGestion() {
  exigerEditeur_();
  return (
    installer_() +
    "\n\nSi l'application n'est pas encore en ligne : bouton « Ouvrir l'assistant » ci-dessous."
  );
}
