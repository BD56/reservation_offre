/**
 * ============================================================================
 * Offres.gs — Nouvelle architecture "1 feuille par offre".
 * ============================================================================
 *
 * Fichier VOLONTAIREMENT séparé de Code.gs : l'ancienne architecture (feuilles
 * Operations / Reservations / Articles) continue de tourner sans être touchée.
 * En fin de migration, il suffira de supprimer Code.gs.
 *
 * ⚠️ En Apps Script, tous les fichiers .gs partagent le MÊME scope global :
 *    aucun nom déclaré ici ne doit exister dans Code.gs.
 *    (Préfixes utilisés pour éviter toute collision : Offres* / *Offre*.)
 *
 * Étape 0 (socle) + Étape 1 (feuille Config) du plan d'implémentation.
 */

const OffresConfig = {
  // --- Feuilles ---
  SHEET_CONFIG: "Config",
  SHEET_LOGS: "Logs",
  PREFIXE_FEUILLE_OFFRE: "Offre_",

  // --- Colonnes de la feuille Config (index 0-based) ---
  COL_CFG_ID: 0,
  COL_CFG_NOM: 1,
  COL_CFG_TYPE: 2,
  COL_CFG_MODE_SAISIE: 3,
  COL_CFG_STATUT: 4,
  COL_CFG_DATE_TERMINAISON: 5,
  COL_CFG_NOM_FEUILLE: 6,
  EN_TETES_CONFIG: ["ID_Offre", "Nom", "Type", "Mode_Saisie", "Statut", "Date_Terminaison", "Nom_Feuille"],

  // --- Colonnes FIXES d'une feuille d'offre (index 0-based) ---
  // Les colonnes d'articles commencent à l'index NB_COLONNES_FIXES.
  COL_RES_ID: 0,
  COL_RES_NOM: 1,
  COL_RES_PRENOM: 2,
  COL_RES_CONTACT: 3,
  COL_RES_STATUT: 4,
  COL_RES_DATE_SAISIE: 5,
  NB_COLONNES_FIXES: 6,
  EN_TETES_FIXES: ["ID_Réservation", "Nom", "Prénom", "Contact", "Statut", "Date_Saisie"],

  // --- Valeurs métier ---
  STATUT_EN_COURS: "En cours",
  STATUT_TERMINEE: "Terminée",
  TYPES: ["Produit", "Evenement"],
  MODES: ["Predefini", "Libre"],
  STATUTS_RESERVATION: ["Réservé", "Contacté", "Retrait", "Annulé"],

  // --- Paramètres (valeurs par défaut, surchargeables via Script Properties) ---
  DEFAUTS: {
    X_JOURS_AVANT_SUPPRESSION: 365,
    LIMITE_TERMINEES_INITIALE: 5,
    LIMITE_TERMINEES_PAGE: 10
  }
};

/**
 * ----------------------------------------------------------------------------
 * PARAMÈTRES
 * Stockés dans les Script Properties => modifiables SANS redéploiement.
 * (Surtout PAS dans appsscript.json : c'est le manifeste, il n'accepte que
 *  des clés connues ; une clé arbitraire y est ignorée ou casse le déploiement.)
 * ----------------------------------------------------------------------------
 */
function getParametreOffre(nom) {
  const defaut = OffresConfig.DEFAUTS[nom];
  if (defaut === undefined) throw new Error(`Paramètre inconnu : "${nom}".`);
  const brut = PropertiesService.getScriptProperties().getProperty(nom);
  if (brut === null || String(brut).trim() === "") return defaut;
  const valeur = parseInt(brut, 10);
  return isNaN(valeur) ? defaut : valeur;
}

function setParametreOffre(nom, valeur) {
  if (OffresConfig.DEFAUTS[nom] === undefined) throw new Error(`Paramètre inconnu : "${nom}".`);
  PropertiesService.getScriptProperties().setProperty(nom, String(valeur));
  return true;
}

/** Écrit les valeurs par défaut pour les paramètres non encore définis. */
function initialiserParametresOffre() {
  const props = PropertiesService.getScriptProperties();
  const resultat = {};
  Object.keys(OffresConfig.DEFAUTS).forEach(nom => {
    if (props.getProperty(nom) === null) props.setProperty(nom, String(OffresConfig.DEFAUTS[nom]));
    resultat[nom] = getParametreOffre(nom);
  });
  return resultat;
}

/**
 * ----------------------------------------------------------------------------
 * VERROU (écritures concurrentes)
 * Deux réservations simultanées peuvent se marcher dessus — pire encore en mode
 * "Libre" où elles peuvent tenter de créer la même colonne d'article en même
 * temps. Toute écriture doit passer par ici.
 * ----------------------------------------------------------------------------
 */
function avecVerrouOffre(action) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) {
    throw new Error("Le système est occupé (une autre écriture est en cours). Réessayez dans quelques instants.");
  }
  try {
    return action();
  } finally {
    verrou.releaseLock();
  }
}

/**
 * ----------------------------------------------------------------------------
 * HELPERS
 * ----------------------------------------------------------------------------
 */

/** Nom de la feuille dédiée à une offre. Règle figée : "Offre_" + ID (tiret conservé). */
function nomFeuilleDeOffre(idOffre) {
  return OffresConfig.PREFIXE_FEUILLE_OFFRE + String(idOffre).trim();
}

/** ID unique d'offre. Le timestamp sert aussi de clé de tri chronologique. */
function genererIdOffre() {
  return "OP-" + new Date().getTime();
}

/**
 * ID unique de réservation.
 * UUID et non timestamp : deux réservations enregistrées dans la même
 * milliseconde produiraient le même identifiant.
 */
function genererIdReservation() {
  return "RES-" + Utilities.getUuid();
}

/** Nettoyage d'affichage d'un nom d'article : trim + espaces multiples réduits. */
function normaliserNomArticle(nom) {
  return String(nom || "").trim().replace(/\s+/g, " ");
}

/**
 * Clé de COMPARAISON d'un nom d'article : insensible à la casse ET aux accents.
 * Sert à détecter qu'une colonne existe déjà sous une variante ("Pommes" / "pommes"
 * / "POMMES"), pour la réutiliser au lieu d'en créer une nouvelle — sinon le résumé
 * de la fiche de préparation serait scindé en plusieurs lignes.
 */
function cleComparaisonArticle(nom) {
  return normaliserNomArticle(nom)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // retire les diacritiques (forme échappée : pas de caractère invisible dans le source)
}

/**
 * ----------------------------------------------------------------------------
 * FEUILLE CONFIG
 * ----------------------------------------------------------------------------
 */

/** Crée la feuille Config avec ses en-têtes si elle n'existe pas. Idempotent. */
function ensureConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = ss.getSheetByName(OffresConfig.SHEET_CONFIG);
  if (!feuille) {
    feuille = ss.insertSheet(OffresConfig.SHEET_CONFIG);
    const enTetes = OffresConfig.EN_TETES_CONFIG;
    feuille.getRange(1, 1, 1, enTetes.length).setValues([enTetes]).setFontWeight("bold");
    feuille.setFrozenRows(1);
    feuille.autoResizeColumns(1, enTetes.length);
  }
  return feuille;
}

/** Crée la feuille Logs si absente. Idempotent. */
function ensureLogsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = ss.getSheetByName(OffresConfig.SHEET_LOGS);
  if (!feuille) {
    feuille = ss.insertSheet(OffresConfig.SHEET_LOGS);
    const enTetes = ["Date", "Action", "ID_Offre", "Détail"];
    feuille.getRange(1, 1, 1, enTetes.length).setValues([enTetes]).setFontWeight("bold");
    feuille.setFrozenRows(1);
  }
  return feuille;
}

/**
 * Journalise une action. Obligatoire pour les suppressions : comme il n'existe
 * AUCUNE sauvegarde, cette ligne est la seule trace restante.
 */
function loggerOffre(action, idOffre, detail) {
  try {
    ensureLogsSheet().appendRow([new Date(), String(action), String(idOffre || ""), String(detail || "")]);
  } catch (e) {
    console.error("Échec d'écriture dans Logs : " + e.message);
  }
}

/** Convertit une ligne de la feuille Config en objet. */
function _ligneVersOffre(ligne) {
  const dateTerm = ligne[OffresConfig.COL_CFG_DATE_TERMINAISON];
  return {
    id: String(ligne[OffresConfig.COL_CFG_ID]).trim(),
    nom: String(ligne[OffresConfig.COL_CFG_NOM] || ""),
    type: String(ligne[OffresConfig.COL_CFG_TYPE] || ""),
    modeSaisie: String(ligne[OffresConfig.COL_CFG_MODE_SAISIE] || ""),
    statut: String(ligne[OffresConfig.COL_CFG_STATUT] || ""),
    // Vraie Date (ou null) : jamais une chaîne formatée, sinon le calcul
    // "+ X jours" dépendrait du parsing d'un format localisé.
    dateTerminaison: (dateTerm instanceof Date) ? dateTerm : null,
    nomFeuille: String(ligne[OffresConfig.COL_CFG_NOM_FEUILLE] || "")
  };
}

/** Lit toutes les offres déclarées dans Config. */
function lireConfigOffres() {
  const feuille = ensureConfigSheet();
  if (feuille.getLastRow() <= 1) return [];
  const donnees = feuille.getDataRange().getValues();
  const offres = [];
  for (let i = 1; i < donnees.length; i++) {
    const id = String(donnees[i][OffresConfig.COL_CFG_ID]).trim();
    if (!id) continue;
    offres.push(_ligneVersOffre(donnees[i]));
  }
  return offres;
}

/** Retourne { offre, numeroLigne } ou null. numeroLigne est 1-based (usage getRange). */
function trouverOffreDansConfig(idOffre) {
  const feuille = ensureConfigSheet();
  if (feuille.getLastRow() <= 1) return null;
  const donnees = feuille.getDataRange().getValues();
  const cible = String(idOffre).trim();
  for (let i = 1; i < donnees.length; i++) {
    if (String(donnees[i][OffresConfig.COL_CFG_ID]).trim() === cible) {
      return { offre: _ligneVersOffre(donnees[i]), numeroLigne: i + 1 };
    }
  }
  return null;
}

/** Ajoute une offre dans Config. À appeler sous verrou. */
function ajouterOffreDansConfig(offre) {
  const feuille = ensureConfigSheet();
  feuille.appendRow([
    offre.id,
    offre.nom,
    offre.type,
    offre.modeSaisie || "",
    offre.statut || OffresConfig.STATUT_EN_COURS,
    offre.dateTerminaison || "",
    offre.nomFeuille || nomFeuilleDeOffre(offre.id)
  ]);
  return true;
}

/**
 * Met à jour les champs fournis d'une offre dans Config.
 * `champs` accepte : nom, type, modeSaisie, statut, dateTerminaison.
 * À appeler sous verrou.
 */
function majOffreDansConfig(idOffre, champs) {
  const trouve = trouverOffreDansConfig(idOffre);
  if (!trouve) throw new Error(`Offre "${idOffre}" introuvable dans Config.`);
  const feuille = ensureConfigSheet();
  const correspondances = {
    nom: OffresConfig.COL_CFG_NOM,
    type: OffresConfig.COL_CFG_TYPE,
    modeSaisie: OffresConfig.COL_CFG_MODE_SAISIE,
    statut: OffresConfig.COL_CFG_STATUT,
    dateTerminaison: OffresConfig.COL_CFG_DATE_TERMINAISON
  };
  Object.keys(champs).forEach(cle => {
    const colonne = correspondances[cle];
    if (colonne === undefined) return; // champ non modifiable (id, nomFeuille)
    feuille.getRange(trouve.numeroLigne, colonne + 1).setValue(champs[cle]);
  });
  return true;
}

/** Supprime la ligne d'une offre dans Config. À appeler sous verrou. */
function supprimerOffreDeConfig(idOffre) {
  const trouve = trouverOffreDansConfig(idOffre);
  if (!trouve) return false;
  ensureConfigSheet().deleteRow(trouve.numeroLigne);
  return true;
}

/**
 * ----------------------------------------------------------------------------
 * VÉRIFICATION DU SOCLE
 * À lancer depuis l'éditeur Apps Script. Ne touche à AUCUNE donnée existante :
 * crée Config/Logs si absentes, écrit puis retire une offre de test.
 * ----------------------------------------------------------------------------
 */
function testerSocleOffres() {
  const rapport = [];
  const parametres = initialiserParametresOffre();
  rapport.push("Paramètres : " + JSON.stringify(parametres));

  ensureConfigSheet();
  ensureLogsSheet();
  rapport.push("Feuilles Config et Logs : OK");

  const nbAvant = lireConfigOffres().length;
  const idTest = genererIdOffre();

  avecVerrouOffre(() => {
    ajouterOffreDansConfig({
      id: idTest, nom: "TEST — à supprimer", type: "Produit",
      modeSaisie: "Predefini", statut: OffresConfig.STATUT_EN_COURS,
      nomFeuille: nomFeuilleDeOffre(idTest)
    });
    majOffreDansConfig(idTest, {
      statut: OffresConfig.STATUT_TERMINEE,
      dateTerminaison: new Date()
    });
  });

  const relu = trouverOffreDansConfig(idTest);
  if (!relu) throw new Error("ÉCHEC : l'offre de test n'a pas été relue.");
  if (relu.offre.statut !== OffresConfig.STATUT_TERMINEE) throw new Error("ÉCHEC : statut non mis à jour.");
  if (!(relu.offre.dateTerminaison instanceof Date)) throw new Error("ÉCHEC : Date_Terminaison n'est pas une vraie Date.");
  rapport.push("Écriture / relecture / mise à jour : OK (Date_Terminaison est bien une Date)");

  avecVerrouOffre(() => supprimerOffreDeConfig(idTest));
  const nbApres = lireConfigOffres().length;
  if (nbApres !== nbAvant) throw new Error(`ÉCHEC : nettoyage incomplet (${nbAvant} avant, ${nbApres} après).`);
  rapport.push("Suppression de l'offre de test : OK");

  rapport.push("Normalisation : " +
    JSON.stringify(["Pommes", " pommes ", "POMMES", "Pómmes"].map(cleComparaisonArticle)) +
    " (les 4 doivent être identiques)");

  const message = rapport.join("\n");
  console.log(message);
  return message;
}
