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
 * POINT D'ENTRÉE DE L'APPLICATION WEB
 * Déplacé ici depuis Code.gs : c'était la dernière dépendance du projet envers
 * l'ancien fichier, qui peut désormais être supprimé sans rien casser.
 * ----------------------------------------------------------------------------
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Application de Réservations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ----------------------------------------------------------------------------
 * DIAGNOSTIC
 * À lancer depuis l'éditeur ET appelable par le frontend : compare ce que voit
 * le script côté éditeur et côté web app déployée (les autorisations diffèrent).
 * Ne modifie rien.
 * ----------------------------------------------------------------------------
 */
function diagnostiquerLiaison() {
  const lignes = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      lignes.push("❌ getActiveSpreadsheet() = null");
      lignes.push("   => le script n'est PAS lié à un classeur (script autonome).");
      lignes.push("   Correctif : utiliser SpreadsheetApp.openById(<ID du classeur>).");
      return lignes.join("\n");
    }
    lignes.push("✅ Classeur : « " + ss.getName() + " »");
    lignes.push("   ID  : " + ss.getId());
    lignes.push("   URL : " + ss.getUrl());

    const feuilles = ss.getSheets().map(f => f.getName());
    lignes.push("   Feuilles (" + feuilles.length + ") : " + feuilles.join(", "));

    const cfg = ss.getSheetByName(OffresConfig.SHEET_CONFIG);
    lignes.push(cfg ? "✅ Feuille Config présente (" + Math.max(0, cfg.getLastRow() - 1) + " offre(s))"
                    : "❌ Feuille Config ABSENTE");

    const offres = lireConfigOffres();
    lignes.push("   Offres lues : " + offres.length +
      (offres.length ? " -> " + offres.map(o => o.nom + " [" + o.statut + "]").join(" | ") : ""));
  } catch (e) {
    lignes.push("❌ ERREUR : " + e.message);
  }
  const message = lignes.join("\n");
  console.log(message);
  return message;
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

/**
 * ============================================================================
 * ÉTAPE 2 — CYCLE DE VIE D'UNE OFFRE + COLONNES D'ARTICLES
 * ============================================================================
 *
 * Structure d'une feuille d'offre :
 *   ligne 1  : en-têtes = [6 colonnes fixes] + [1 colonne par article]
 *   lignes 2+: une réservation par ligne (quantité dans la colonne de l'article)
 *
 * Une offre de type "Evenement" n'a QUE les 6 colonnes fixes.
 */

/** Résout une offre : sa ligne Config + sa feuille. Lève si l'une des deux manque. */
function _feuilleDeOffre(idOffre) {
  const trouve = trouverOffreDansConfig(idOffre);
  if (!trouve) throw new Error(`Offre "${idOffre}" introuvable dans Config.`);
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(trouve.offre.nomFeuille);
  if (!feuille) throw new Error(`Feuille "${trouve.offre.nomFeuille}" introuvable (offre "${idOffre}").`);
  return { feuille: feuille, offre: trouve.offre, numeroLigne: trouve.numeroLigne };
}

/** En-têtes bruts (ligne 1) de la feuille d'une offre. */
function lireEnTetesOffre(feuille) {
  const nbColonnes = feuille.getLastColumn();
  if (nbColonnes === 0) return [];
  return feuille.getRange(1, 1, 1, nbColonnes).getValues()[0].map(v => String(v || ""));
}

/** Colonnes d'articles d'une offre : [{ nom, index }] (index 0-based dans la ligne). */
function lireArticlesOffre(feuille) {
  const enTetes = lireEnTetesOffre(feuille);
  const articles = [];
  for (let i = OffresConfig.NB_COLONNES_FIXES; i < enTetes.length; i++) {
    const nom = normaliserNomArticle(enTetes[i]);
    if (nom) articles.push({ nom: nom, index: i });
  }
  return articles;
}

/**
 * Cherche la colonne d'un article en comparant sur la clé normalisée
 * (casse + accents ignorés) => "pommes" retrouve la colonne "Pommes".
 */
function trouverColonneArticle(feuille, nomArticle) {
  const cle = cleComparaisonArticle(nomArticle);
  if (!cle) return null;
  const articles = lireArticlesOffre(feuille);
  for (let i = 0; i < articles.length; i++) {
    if (cleComparaisonArticle(articles[i].nom) === cle) return articles[i];
  }
  return null;
}

/**
 * Normalise une liste d'articles (tableau ou chaîne séparée par des virgules) :
 * nettoyage, suppression des vides, et déduplication sur la clé de comparaison
 * (la première forme d'écriture rencontrée est conservée pour l'affichage).
 */
function _normaliserListeArticles(liste) {
  const brut = Array.isArray(liste) ? liste : String(liste || "").split(",");
  const vus = {};
  const resultat = [];
  brut.forEach(element => {
    const nom = normaliserNomArticle(element);
    if (!nom) return;
    const cle = cleComparaisonArticle(nom);
    if (vus[cle]) return;
    vus[cle] = true;
    resultat.push(nom);
  });
  return resultat;
}

/**
 * Convertit une Date en chaîne ISO pour le TRANSPORT vers le frontend.
 *
 * ⚠️ google.script.run sérialise les valeurs de retour ; un objet contenant des
 * Date peut échouer silencieusement à la sérialisation, et le handler de succès
 * reçoit alors `null` SANS aucune erreur. Le piège est que l'éditeur ne sérialise
 * rien : une fonction peut donc marcher en test et renvoyer null au web app.
 * On ne fait donc traverser que des types simples (chaînes, nombres, booléens).
 */
function _dateISO(valeur) {
  return (valeur instanceof Date && !isNaN(valeur.getTime())) ? valeur.toISOString() : null;
}

/** Date de suppression automatique prévue pour une offre terminée. */
function calculerDateSuppression(dateTerminaison) {
  if (!(dateTerminaison instanceof Date)) return null;
  const jours = getParametreOffre("X_JOURS_AVANT_SUPPRESSION");
  const date = new Date(dateTerminaison.getTime());
  date.setDate(date.getDate() + jours);
  return date;
}

/**
 * Crée une offre : feuille dédiée + entrée dans Config.
 * data = { nom, type, modeSaisie, articlesPredefinis }
 */
function creerOffre(data) {
  return avecVerrouOffre(function () {
    const nom = String((data && data.nom) || "").trim();
    if (!nom) throw new Error("Le nom de l'offre est obligatoire.");

    const type = String((data && data.type) || "").trim();
    if (OffresConfig.TYPES.indexOf(type) === -1) {
      throw new Error(`Type invalide : "${type}". Attendu : ${OffresConfig.TYPES.join(" ou ")}.`);
    }

    // Une offre "Evenement" n'a ni mode de saisie ni articles.
    let modeSaisie = "";
    if (type === "Produit") {
      modeSaisie = String((data && data.modeSaisie) || "Libre").trim();
      if (OffresConfig.MODES.indexOf(modeSaisie) === -1) {
        throw new Error(`Mode de saisie invalide : "${modeSaisie}". Attendu : ${OffresConfig.MODES.join(" ou ")}.`);
      }
    }

    const id = genererIdOffre();
    const nomFeuille = nomFeuilleDeOffre(id);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName(nomFeuille)) throw new Error(`La feuille "${nomFeuille}" existe déjà.`);

    // En-têtes : colonnes fixes, puis une colonne par article prédéfini.
    let enTetes = OffresConfig.EN_TETES_FIXES.slice();
    let articles = [];
    if (type === "Produit" && modeSaisie === "Predefini") {
      articles = _normaliserListeArticles(data && data.articlesPredefinis);
      enTetes = enTetes.concat(articles);
    }

    const feuille = ss.insertSheet(nomFeuille);
    feuille.getRange(1, 1, 1, enTetes.length).setValues([enTetes]).setFontWeight("bold");
    feuille.setFrozenRows(1);

    ajouterOffreDansConfig({
      id: id, nom: nom, type: type, modeSaisie: modeSaisie,
      statut: OffresConfig.STATUT_EN_COURS, dateTerminaison: "", nomFeuille: nomFeuille
    });

    loggerOffre("CREATION_OFFRE", id, `"${nom}" (${type}${modeSaisie ? " / " + modeSaisie : ""}) — ${articles.length} article(s)`);
    return { id: id, nom: nom, type: type, modeSaisie: modeSaisie, nomFeuille: nomFeuille, articles: articles };
  });
}

/**
 * Lit une offre complète : métadonnées + réservations + résumé par article.
 * Le résumé est une simple SOMME DE COLONNE (gain majeur de la nouvelle archi).
 * Il inclut tous les articles déclarés, même à 0 (le frontend filtre s'il veut).
 * Les dates sont renvoyées en vraies Date : le formatage est du ressort du frontend.
 */
function getOffreById(idOffre) {
  const contexte = _feuilleDeOffre(idOffre);
  return _construireDetailOffre(contexte.offre, contexte.feuille);
}

/**
 * Construit le détail d'une offre à partir d'une ligne Config DÉJÀ lue.
 * Extrait de getOffreById pour que le préchargement puisse traiter N offres
 * sans relire la feuille Config à chaque fois.
 */
function _construireDetailOffre(offre, feuille) {
  const articles = lireArticlesOffre(feuille);

  const totaux = {};
  articles.forEach(a => { totaux[a.nom] = 0; });

  const reservations = [];
  if (feuille.getLastRow() > 1) {
    const donnees = feuille.getDataRange().getValues();
    for (let i = 1; i < donnees.length; i++) {
      const ligne = donnees[i];
      const idRes = String(ligne[OffresConfig.COL_RES_ID] || "").trim();
      if (!idRes) continue;

      const detail = [];
      articles.forEach(a => {
        const quantite = parseInt(ligne[a.index], 10);
        if (!isNaN(quantite) && quantite > 0) {
          detail.push({ nom: a.nom, quantite: quantite });
          totaux[a.nom] += quantite;
        }
      });

      const dateSaisie = ligne[OffresConfig.COL_RES_DATE_SAISIE];
      reservations.push({
        idRes: idRes,
        nom: String(ligne[OffresConfig.COL_RES_NOM] || ""),
        prenom: String(ligne[OffresConfig.COL_RES_PRENOM] || ""),
        contact: String(ligne[OffresConfig.COL_RES_CONTACT] || ""),
        etat: String(ligne[OffresConfig.COL_RES_STATUT] || OffresConfig.STATUTS_RESERVATION[0]),
        dateSaisie: _dateISO(dateSaisie),
        articles: detail
      });
    }
  }

  const resume = articles
    .map(a => ({ nom: a.nom, total: totaux[a.nom] }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return {
    offre: {
      id: offre.id, nom: offre.nom, type: offre.type, modeSaisie: offre.modeSaisie,
      statut: offre.statut,
      // Booléen explicite : le frontend ne doit pas dépendre d'une comparaison
      // de chaîne accentuée ("Terminée") transitant par google.script.run.
      isTerminee: offre.statut === OffresConfig.STATUT_TERMINEE,
      dateTerminaison: _dateISO(offre.dateTerminaison),
      dateSuppressionPrevue: _dateISO(calculerDateSuppression(offre.dateTerminaison)),
      nomFeuille: offre.nomFeuille,
      articles: articles.map(a => a.nom)
    },
    reservations: reservations,
    resume: resume
  };
}

/**
 * Ajoute une colonne d'article. Si une variante existe déjà (casse/accents),
 * la colonne existante est RÉUTILISÉE : c'est ce qui empêche le résumé d'être
 * scindé en "Pommes" et "pommes".
 */
function ajouterArticleOffre(idOffre, nomArticle) {
  return avecVerrouOffre(function () { return _ajouterArticleSansVerrou(idOffre, nomArticle); });
}

/** Variante sans verrou : à n'appeler QUE depuis un bloc déjà verrouillé. */
function _ajouterArticleSansVerrou(idOffre, nomArticle) {
  const nom = normaliserNomArticle(nomArticle);
  if (!nom) throw new Error("Le nom de l'article est vide.");
  const feuille = _feuilleDeOffre(idOffre).feuille;

  const existant = trouverColonneArticle(feuille, nom);
  if (existant) return { nom: existant.nom, index: existant.index, cree: false };

  const index = feuille.getLastColumn(); // 0-based de la NOUVELLE colonne
  feuille.getRange(1, index + 1).setValue(nom).setFontWeight("bold");
  // Écriture appliquée immédiatement : sans cela, un appel successif (plusieurs
  // articles inconnus dans une même réservation) pourrait relire un getLastColumn()
  // périmé et écrire le second article DANS LA MÊME COLONNE.
  SpreadsheetApp.flush();
  return { nom: nom, index: index, cree: true };
}

/**
 * Compte les réservations ayant une quantité > 0 sur cet article.
 * Sert à l'AVERTISSEMENT affiché avant suppression de la colonne.
 */
function compterReservationsAvecArticle(idOffre, nomArticle) {
  const feuille = _feuilleDeOffre(idOffre).feuille;
  const colonne = trouverColonneArticle(feuille, nomArticle);
  if (!colonne) return 0;

  const derniereLigne = feuille.getLastRow();
  if (derniereLigne <= 1) return 0;

  const valeurs = feuille.getRange(2, colonne.index + 1, derniereLigne - 1, 1).getValues();
  let compteur = 0;
  valeurs.forEach(ligne => {
    const quantite = parseInt(ligne[0], 10);
    if (!isNaN(quantite) && quantite > 0) compteur++;
  });
  return compteur;
}

/**
 * Supprime la colonne d'un article (et donc les quantités déjà saisies).
 * ⚠️ Destructif : le frontend DOIT avoir averti avec le décompte au préalable.
 */
function supprimerArticleOffre(idOffre, nomArticle) {
  return avecVerrouOffre(function () {
    const feuille = _feuilleDeOffre(idOffre).feuille;
    const colonne = trouverColonneArticle(feuille, nomArticle);
    if (!colonne) throw new Error(`Article "${nomArticle}" introuvable dans cette offre.`);

    const impactees = compterReservationsAvecArticle(idOffre, nomArticle);
    feuille.deleteColumn(colonne.index + 1);
    loggerOffre("SUPPRESSION_ARTICLE", idOffre, `"${colonne.nom}" — ${impactees} réservation(s) impactée(s)`);
    return { nom: colonne.nom, reservationsImpactees: impactees };
  });
}

/**
 * Termine une offre : Statut + Date_Terminaison (vraie Date).
 * Idempotent : ré-appeler sur une offre déjà terminée ne change rien.
 * Ne bloque JAMAIS sur des réservations encore "Réservé" (décision arbitrée) :
 * on renvoie leur nombre pour que le frontend puisse simplement avertir.
 */
function terminerOffre(idOffre) {
  return avecVerrouOffre(function () {
    const trouve = trouverOffreDansConfig(idOffre);
    if (!trouve) throw new Error(`Offre "${idOffre}" introuvable dans Config.`);

    if (trouve.offre.statut === OffresConfig.STATUT_TERMINEE) {
      return {
        dejaTerminee: true,
        dateTerminaison: _dateISO(trouve.offre.dateTerminaison),
        dateSuppressionPrevue: _dateISO(calculerDateSuppression(trouve.offre.dateTerminaison))
      };
    }

    const maintenant = new Date();
    majOffreDansConfig(idOffre, { statut: OffresConfig.STATUT_TERMINEE, dateTerminaison: maintenant });
    const dateSuppression = calculerDateSuppression(maintenant);

    loggerOffre("TERMINAISON_OFFRE", idOffre,
      `"${trouve.offre.nom}" — suppression prévue le ${dateSuppression ? dateSuppression.toISOString().slice(0, 10) : "?"}`);

    return { dejaTerminee: false, dateTerminaison: _dateISO(maintenant), dateSuppressionPrevue: _dateISO(dateSuppression) };
  });
}

/**
 * Supprime définitivement une offre : sa feuille + sa ligne Config.
 * ⚠️ Irréversible et SANS sauvegarde (décision arbitrée). Le log est la seule trace.
 */
function supprimerOffre(idOffre) {
  return avecVerrouOffre(function () {
    const trouve = trouverOffreDansConfig(idOffre);
    if (!trouve) throw new Error(`Offre "${idOffre}" introuvable dans Config.`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const feuille = ss.getSheetByName(trouve.offre.nomFeuille);
    let nbReservations = 0;
    if (feuille) {
      nbReservations = Math.max(0, feuille.getLastRow() - 1);
      ss.deleteSheet(feuille);
    }
    supprimerOffreDeConfig(idOffre);

    loggerOffre("SUPPRESSION_OFFRE", idOffre, `"${trouve.offre.nom}" — ${nbReservations} réservation(s) perdue(s)`);
    return { nom: trouve.offre.nom, reservationsSupprimees: nbReservations };
  });
}

/**
 * ----------------------------------------------------------------------------
 * VÉRIFICATION DE L'ÉTAPE 2
 * Crée une offre de test, manipule ses articles, la termine, puis la supprime.
 * N'affecte AUCUNE donnée existante.
 * ----------------------------------------------------------------------------
 */
function testerOffresEtape2() {
  const rapport = [];

  // 1. Création avec articles prédéfinis contenant volontairement des doublons
  const creee = creerOffre({
    nom: "TEST étape 2 — à supprimer",
    type: "Produit",
    modeSaisie: "Predefini",
    articlesPredefinis: ["Pommes", " pommes ", "Poires", "", "POMMES", "Bananes"]
  });
  if (creee.articles.length !== 3) {
    throw new Error(`ÉCHEC déduplication : attendu 3 articles, obtenu ${creee.articles.length} (${creee.articles.join(", ")}).`);
  }
  rapport.push(`Création + déduplication : OK → [${creee.articles.join(", ")}]`);

  // 2. Réutilisation d'une colonne existante via une variante d'écriture
  const reutilise = ajouterArticleOffre(creee.id, "pÔmmes ");
  const nouveau = ajouterArticleOffre(creee.id, "Cerises");
  if (reutilise.cree !== false) throw new Error("ÉCHEC : une variante a créé une colonne au lieu de réutiliser.");
  if (nouveau.cree !== true) throw new Error("ÉCHEC : un article réellement nouveau n'a pas été créé.");
  rapport.push(`Colonnes : "pÔmmes" réutilise "${reutilise.nom}", "Cerises" créée`);

  // 3. Lecture complète
  const lu = getOffreById(creee.id);
  if (lu.offre.articles.length !== 4) throw new Error(`ÉCHEC : attendu 4 colonnes d'articles, obtenu ${lu.offre.articles.length}.`);
  if (lu.reservations.length !== 0) throw new Error("ÉCHEC : l'offre neuve ne doit avoir aucune réservation.");
  rapport.push(`Lecture : ${lu.offre.articles.length} articles, ${lu.reservations.length} réservation, résumé de ${lu.resume.length} ligne(s)`);

  // 4. Décompte avant suppression d'article (aucune réservation => 0)
  const impactees = compterReservationsAvecArticle(creee.id, "Cerises");
  if (impactees !== 0) throw new Error(`ÉCHEC : attendu 0 réservation impactée, obtenu ${impactees}.`);
  const supprime = supprimerArticleOffre(creee.id, "cerises"); // variante d'écriture volontaire
  rapport.push(`Suppression d'article : "${supprime.nom}" retirée (${supprime.reservationsImpactees} impactée(s))`);

  // 5. Terminaison + date de suppression prévue
  const terminee = terminerOffre(creee.id);
  const attendue = getParametreOffre("X_JOURS_AVANT_SUPPRESSION");
  const ecartJours = Math.round((terminee.dateSuppressionPrevue - terminee.dateTerminaison) / 86400000);
  if (ecartJours !== attendue) throw new Error(`ÉCHEC : écart de ${ecartJours} jours au lieu de ${attendue}.`);
  rapport.push(`Terminaison : suppression prévue dans ${ecartJours} jours (${terminee.dateSuppressionPrevue.toISOString().slice(0, 10)})`);

  // 6. Idempotence de la terminaison
  if (terminerOffre(creee.id).dejaTerminee !== true) throw new Error("ÉCHEC : terminaison non idempotente.");
  rapport.push("Terminaison idempotente : OK");

  // 7. Nettoyage
  supprimerOffre(creee.id);
  if (trouverOffreDansConfig(creee.id)) throw new Error("ÉCHEC : l'offre de test est encore dans Config.");
  if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName(creee.nomFeuille)) {
    throw new Error("ÉCHEC : la feuille de test existe encore.");
  }
  rapport.push("Suppression de l'offre de test (feuille + Config) : OK");

  const message = rapport.join("\n");
  console.log(message);
  return message;
}

/**
 * ============================================================================
 * ÉTAPE 3 — RÉSERVATIONS
 * ============================================================================
 * Une réservation = une ligne dans la feuille de l'offre.
 * Les quantités vont dans la colonne de l'article correspondant.
 */

/**
 * Ajoute une réservation.
 * data = { nom, prenom, telephone, email, articles: [{ nom, quantite }] }
 *
 * Mode "Libre"     : les articles inconnus créent leur colonne (après normalisation).
 * Mode "Predefini" : un article inconnu lève une erreur — mieux vaut le signaler
 *                    que de perdre silencieusement une commande client.
 */
function ajouterReservationOffre(idOffre, data) {
  return avecVerrouOffre(function () {
    const nom = String((data && data.nom) || "").trim();
    const prenom = String((data && data.prenom) || "").trim();
    if (!nom || !prenom) throw new Error("Le nom et le prénom sont obligatoires.");

    const contexte = _feuilleDeOffre(idOffre);
    const feuille = contexte.feuille;
    const offre = contexte.offre;

    if (offre.statut === OffresConfig.STATUT_TERMINEE) {
      throw new Error(`L'offre "${offre.nom}" est terminée : aucune nouvelle réservation n'est possible.`);
    }

    // Contact : téléphone et/ou email, au moins l'un des deux.
    let contact = String((data && data.telephone) || "").trim();
    const email = String((data && data.email) || "").trim();
    if (email) contact += (contact ? " / " : "") + email;
    if (!contact) throw new Error("Au moins un téléphone ou un email est requis.");

    // Articles saisis, nettoyés (quantités <= 0 et noms vides ignorés).
    const saisis = [];
    const brut = (data && Array.isArray(data.articles)) ? data.articles : [];
    brut.forEach(article => {
      const nomArticle = normaliserNomArticle(article && article.nom);
      const quantite = parseInt(article && article.quantite, 10);
      if (!nomArticle || isNaN(quantite) || quantite <= 0) return;
      saisis.push({ nom: nomArticle, quantite: quantite });
    });

    if (saisis.length > 0 && offre.type !== "Produit") {
      throw new Error(`L'offre "${offre.nom}" est de type ${offre.type} : elle n'accepte pas d'articles.`);
    }

    // Colonnes manquantes : créées en mode Libre, refusées en mode Predefini.
    const manquants = [];
    saisis.forEach(article => {
      if (!trouverColonneArticle(feuille, article.nom)) manquants.push(article.nom);
    });
    if (manquants.length > 0) {
      if (offre.modeSaisie !== "Libre") {
        throw new Error(`Article(s) inconnu(s) pour cette offre à liste fixe : ${manquants.join(", ")}.`);
      }
      manquants.forEach(nomArticle => _ajouterArticleSansVerrou(idOffre, nomArticle));
    }

    // Construction de la ligne. On dimensionne sur le nombre RÉEL de colonnes
    // et on écrit via l'index réel de chaque colonne : robuste même si un
    // en-tête vide traînait au milieu.
    const articles = lireArticlesOffre(feuille);
    const nbColonnes = Math.max(feuille.getLastColumn(), OffresConfig.NB_COLONNES_FIXES);
    const ligne = new Array(nbColonnes).fill("");

    const idReservation = genererIdReservation();
    ligne[OffresConfig.COL_RES_ID] = idReservation;
    ligne[OffresConfig.COL_RES_NOM] = nom;
    ligne[OffresConfig.COL_RES_PRENOM] = prenom;
    ligne[OffresConfig.COL_RES_CONTACT] = contact;
    ligne[OffresConfig.COL_RES_STATUT] = OffresConfig.STATUTS_RESERVATION[0]; // "Réservé"
    ligne[OffresConfig.COL_RES_DATE_SAISIE] = new Date(); // vraie Date

    const indexParCle = {};
    articles.forEach(a => { indexParCle[cleComparaisonArticle(a.nom)] = a.index; });

    // Cumul : si le même article a été saisi sur plusieurs lignes du formulaire,
    // les quantités s'additionnent au lieu de s'écraser.
    saisis.forEach(article => {
      const index = indexParCle[cleComparaisonArticle(article.nom)];
      if (index === undefined) return;
      ligne[index] = (parseInt(ligne[index], 10) || 0) + article.quantite;
    });

    feuille.appendRow(ligne);

    return {
      idRes: idReservation, nom: nom, prenom: prenom, contact: contact,
      etat: OffresConfig.STATUTS_RESERVATION[0],
      articles: saisis
    };
  });
}

/**
 * Change le statut d'une réservation.
 * Volontairement AUTORISÉ sur une offre terminée : on doit pouvoir passer une
 * commande en "Retrait" après la clôture de l'offre (décision validée).
 */
function mettreAJourStatutReservation(idOffre, idReservation, nouveauStatut) {
  return avecVerrouOffre(function () {
    if (OffresConfig.STATUTS_RESERVATION.indexOf(nouveauStatut) === -1) {
      throw new Error(`Statut invalide : "${nouveauStatut}". Attendu : ${OffresConfig.STATUTS_RESERVATION.join(", ")}.`);
    }
    const feuille = _feuilleDeOffre(idOffre).feuille;
    const derniereLigne = feuille.getLastRow();
    if (derniereLigne <= 1) throw new Error("Cette offre ne contient aucune réservation.");

    // On ne lit QUE la colonne des identifiants.
    const ids = feuille.getRange(2, OffresConfig.COL_RES_ID + 1, derniereLigne - 1, 1).getValues();
    const cible = String(idReservation).trim();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === cible) {
        feuille.getRange(i + 2, OffresConfig.COL_RES_STATUT + 1).setValue(nouveauStatut);
        return true;
      }
    }
    throw new Error(`Réservation "${idReservation}" introuvable dans l'offre "${idOffre}".`);
  });
}

/**
 * ----------------------------------------------------------------------------
 * VÉRIFICATION DE L'ÉTAPE 3
 * ----------------------------------------------------------------------------
 */
function testerOffresEtape3() {
  const rapport = [];
  let offrePredefinie = null;
  let offreLibre = null;

  try {
    // --- Offre à liste fixe ---
    offrePredefinie = creerOffre({
      nom: "TEST étape 3 (Predefini) — à supprimer",
      type: "Produit", modeSaisie: "Predefini",
      articlesPredefinis: ["Pommes", "Poires"]
    });

    ajouterReservationOffre(offrePredefinie.id, {
      nom: "Dupont", prenom: "Jean", telephone: "0612345678",
      articles: [{ nom: "Pommes", quantite: 2 }, { nom: "Poires", quantite: 3 }]
    });

    // Variante d'écriture + cumul sur deux lignes du même article
    ajouterReservationOffre(offrePredefinie.id, {
      nom: "Martin", prenom: "Pierre", email: "pierre@mail.com",
      articles: [{ nom: "pommes", quantite: 5 }, { nom: "POMMES", quantite: 1 }]
    });

    const lu = getOffreById(offrePredefinie.id);
    if (lu.reservations.length !== 2) throw new Error(`ÉCHEC : attendu 2 réservations, obtenu ${lu.reservations.length}.`);

    const totalPommes = lu.resume.filter(r => r.nom === "Pommes")[0].total;
    const totalPoires = lu.resume.filter(r => r.nom === "Poires")[0].total;
    if (totalPommes !== 8) throw new Error(`ÉCHEC résumé : Pommes = ${totalPommes}, attendu 8 (2 + 5 + 1).`);
    if (totalPoires !== 3) throw new Error(`ÉCHEC résumé : Poires = ${totalPoires}, attendu 3.`);
    if (lu.offre.articles.length !== 2) throw new Error(`ÉCHEC : les variantes ont créé ${lu.offre.articles.length} colonnes au lieu de 2.`);
    rapport.push(`Predefini : 2 réservations, résumé Pommes=8 (cumul + variantes de casse), Poires=3, toujours 2 colonnes`);

    // Un article inconnu doit être REFUSÉ en mode Predefini
    let refuse = false;
    try {
      ajouterReservationOffre(offrePredefinie.id, {
        nom: "Durand", prenom: "Luc", telephone: "0700000000",
        articles: [{ nom: "Ananas", quantite: 1 }]
      });
    } catch (e) { refuse = true; }
    if (!refuse) throw new Error("ÉCHEC : un article inconnu a été accepté en mode Predefini.");
    rapport.push("Predefini : article inconnu correctement refusé");

    // Changement de statut
    const idRes = lu.reservations[0].idRes;
    mettreAJourStatutReservation(offrePredefinie.id, idRes, "Retrait");
    const relu = getOffreById(offrePredefinie.id);
    const majOk = relu.reservations.filter(r => r.idRes === idRes)[0].etat === "Retrait";
    if (!majOk) throw new Error("ÉCHEC : statut non mis à jour.");
    rapport.push("Changement de statut : OK");

    // Statut modifiable même après terminaison (comportement voulu)
    terminerOffre(offrePredefinie.id);
    mettreAJourStatutReservation(offrePredefinie.id, idRes, "Contacté");
    rapport.push("Statut modifiable sur une offre terminée : OK");

    // Mais plus aucune nouvelle réservation
    let bloque = false;
    try {
      ajouterReservationOffre(offrePredefinie.id, {
        nom: "Trop", prenom: "Tard", telephone: "0600000000", articles: []
      });
    } catch (e) { bloque = true; }
    if (!bloque) throw new Error("ÉCHEC : une réservation a été acceptée sur une offre terminée.");
    rapport.push("Nouvelle réservation refusée sur offre terminée : OK");

    // --- Offre libre : les articles inconnus créent leur colonne ---
    offreLibre = creerOffre({ nom: "TEST étape 3 (Libre) — à supprimer", type: "Produit", modeSaisie: "Libre" });
    ajouterReservationOffre(offreLibre.id, {
      nom: "Petit", prenom: "Anne", telephone: "0611111111",
      articles: [{ nom: "Cerises", quantite: 4 }, { nom: " cerises ", quantite: 2 }]
    });
    const luLibre = getOffreById(offreLibre.id);
    if (luLibre.offre.articles.length !== 1) throw new Error(`ÉCHEC Libre : ${luLibre.offre.articles.length} colonnes au lieu de 1.`);
    if (luLibre.resume[0].total !== 6) throw new Error(`ÉCHEC Libre : total ${luLibre.resume[0].total} au lieu de 6.`);
    rapport.push("Libre : colonne créée à la volée, variantes fusionnées (Cerises = 6)");

    const message = rapport.join("\n");
    console.log(message);
    return message;

  } finally {
    // Nettoyage systématique, même en cas d'échec d'une assertion.
    if (offrePredefinie) { try { supprimerOffre(offrePredefinie.id); } catch (e) {} }
    if (offreLibre) { try { supprimerOffre(offreLibre.id); } catch (e) {} }
  }
}

/**
 * ============================================================================
 * ÉTAPE 4 — LISTING + CHARGEMENT PROGRESSIF
 * ============================================================================
 * Ces fonctions ne lisent QUE la feuille Config : elles restent rapides quel
 * que soit l'historique. Les détails d'une offre ne sont lus qu'à son ouverture
 * (getOffreById).
 */

/**
 * Nombre de réservations d'une offre, via getLastRow() : appel peu coûteux,
 * il ne charge pas les données. Évite de dénormaliser un compteur dans Config
 * (qui finirait par dériver).
 */
function _compterReservationsFeuille(nomFeuille) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  if (!feuille) return 0;
  return Math.max(0, feuille.getLastRow() - 1);
}

/**
 * Charge utile allégée d'une offre pour les listes.
 * Inclut la liste des articles : le formulaire de réservation en a besoin dès
 * la sélection dans le dropdown (mode Predefini) et pour l'autocomplétion
 * (mode Libre). Seule la ligne d'en-tête est lue — coût négligeable.
 */
function _versResumeOffre(offre) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(offre.nomFeuille);
  let articles = [];
  let count = 0;
  if (feuille) {
    count = Math.max(0, feuille.getLastRow() - 1);
    articles = lireArticlesOffre(feuille).map(a => a.nom);
  }
  return {
    id: offre.id,
    nom: offre.nom,
    type: offre.type,
    modeSaisie: offre.modeSaisie,
    statut: offre.statut,
    isTerminee: offre.statut === OffresConfig.STATUT_TERMINEE,
    dateTerminaison: _dateISO(offre.dateTerminaison),
    dateSuppressionPrevue: _dateISO(calculerDateSuppression(offre.dateTerminaison)),
    articles: articles,
    count: count
  };
}

/** Tri des offres terminées : la plus récemment terminée d'abord (sans date = en dernier). */
function _trierTermineesRecentesDabord(a, b) {
  const da = (a.dateTerminaison instanceof Date) ? a.dateTerminaison.getTime() : -1;
  const db = (b.dateTerminaison instanceof Date) ? b.dateTerminaison.getTime() : -1;
  return db - da;
}

/** Tri des offres actives : la plus récemment créée d'abord (timestamp de l'ID). */
function _trierActivesRecentesDabord(a, b) {
  const ts = id => { const m = String(id).match(/OP-(\d+)/); return m ? parseInt(m[1], 10) : 0; };
  return ts(b.id) - ts(a.id);
}

/**
 * Chargement initial : toutes les offres actives + les N terminées les plus récentes.
 */
function getOffresActivesEtTermineesRecentes(limitTerminees) {
  const limite = (limitTerminees === undefined || limitTerminees === null || limitTerminees === "")
    ? getParametreOffre("LIMITE_TERMINEES_INITIALE")
    : Math.max(0, parseInt(limitTerminees, 10) || 0);

  const toutes = lireConfigOffres();
  const actives = toutes.filter(o => o.statut !== OffresConfig.STATUT_TERMINEE).sort(_trierActivesRecentesDabord);
  const terminees = toutes.filter(o => o.statut === OffresConfig.STATUT_TERMINEE).sort(_trierTermineesRecentesDabord);
  const termineesRecentes = terminees.slice(0, limite);

  // On renvoie AUSSI le contenu complet de ces offres, dans le MÊME aller-retour.
  // Séparer les deux appels obligeait à attendre deux latences successives avant
  // que le cache soit prêt ; ici il l'est dès le premier affichage.
  // Chaque feuille n'est ouverte qu'une fois : la fiche allégée est dérivée du
  // détail, au lieu de relire l'en-tête et le nombre de lignes séparément.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const details = {};

  const versLeger = function (offre) {
    const feuille = ss.getSheetByName(offre.nomFeuille);
    if (!feuille) {
      // Feuille absente : on n'interrompt pas le chargement, l'offre est
      // simplement listée sans contenu (et l'anomalie est tracée).
      console.error('Chargement : feuille "' + offre.nomFeuille + '" introuvable.');
      return _versResumeOffre(offre);
    }
    const detail = _construireDetailOffre(offre, feuille);
    details[offre.id] = detail;
    const meta = detail.offre;
    return {
      id: meta.id, nom: meta.nom, type: meta.type, modeSaisie: meta.modeSaisie,
      statut: meta.statut, isTerminee: meta.isTerminee,
      dateTerminaison: meta.dateTerminaison,
      dateSuppressionPrevue: meta.dateSuppressionPrevue,
      articles: meta.articles,
      count: detail.reservations.length
    };
  };

  return {
    actives: actives.map(versLeger),
    termineesRecentes: termineesRecentes.map(versLeger),
    totalTerminees: terminees.length,
    hasMoreTerminees: terminees.length > limite,
    details: details
  };
}

/**
 * Lazy loading : les offres terminées de `offset` à `offset + limit`.
 */
function getOffresTermineesPaginees(offset, limit) {
  const debut = Math.max(0, parseInt(offset, 10) || 0);
  const taille = (limit === undefined || limit === null || limit === "")
    ? getParametreOffre("LIMITE_TERMINEES_PAGE")
    : Math.max(1, parseInt(limit, 10) || 1);

  const terminees = lireConfigOffres()
    .filter(o => o.statut === OffresConfig.STATUT_TERMINEE)
    .sort(_trierTermineesRecentesDabord);

  const page = terminees.slice(debut, debut + taille);
  return {
    offres: page.map(_versResumeOffre),
    offset: debut,
    total: terminees.length,
    hasMore: (debut + page.length) < terminees.length
  };
}

/**
 * ============================================================================
 * ÉTAPE 5 — NETTOYAGE AUTOMATIQUE (⚠️ SEULE OPÉRATION IRRÉVERSIBLE)
 * ============================================================================
 * Aucune sauvegarde n'est réalisée (décision arbitrée) : la feuille Logs est la
 * seule trace qui subsiste après une suppression.
 */

/**
 * Coeur du nettoyage.
 * @param {boolean} simulation  true = ne supprime RIEN, retourne seulement ce qui serait supprimé.
 */
function _nettoyageOffresTerminees(simulation) {
  const jours = getParametreOffre("X_JOURS_AVANT_SUPPRESSION");
  const maintenant = new Date();

  const eligibles = [];
  lireConfigOffres().forEach(offre => {
    if (offre.statut !== OffresConfig.STATUT_TERMINEE) return;
    // SÉCURITÉ : une offre terminée sans Date_Terminaison n'est JAMAIS supprimée.
    // (Sans ce garde-fou, une date vide serait interprétée comme très ancienne.)
    if (!(offre.dateTerminaison instanceof Date)) {
      loggerOffre("ANOMALIE", offre.id, `"${offre.nom}" est terminée mais sans Date_Terminaison : ignorée par le nettoyage.`);
      return;
    }
    const dateSuppression = calculerDateSuppression(offre.dateTerminaison);
    if (dateSuppression && dateSuppression <= maintenant) {
      eligibles.push({ offre: offre, dateSuppression: dateSuppression });
    }
  });

  const supprimees = [];
  const echecs = [];

  if (!simulation) {
    eligibles.forEach(element => {
      try {
        const resultat = supprimerOffre(element.offre.id); // journalise déjà SUPPRESSION_OFFRE
        supprimees.push({ id: element.offre.id, nom: element.offre.nom, reservations: resultat.reservationsSupprimees });
      } catch (e) {
        echecs.push({ id: element.offre.id, nom: element.offre.nom, erreur: e.message });
        loggerOffre("ECHEC_SUPPRESSION_AUTO", element.offre.id, e.message);
      }
    });
    if (eligibles.length > 0) {
      loggerOffre("NETTOYAGE_AUTO", "", `${supprimees.length} offre(s) supprimée(s), ${echecs.length} échec(s) — seuil ${jours} jours`);
    }
  }

  return {
    simulation: !!simulation,
    seuilJours: jours,
    executeLe: maintenant,
    eligibles: eligibles.map(e => ({
      id: e.offre.id, nom: e.offre.nom,
      dateTerminaison: e.offre.dateTerminaison,
      dateSuppressionPrevue: e.dateSuppression,
      reservations: _compterReservationsFeuille(e.offre.nomFeuille)
    })),
    supprimees: supprimees,
    echecs: echecs
  };
}

/**
 * SIMULATION — ne supprime rien. À lancer pour vérifier ce que le nettoyage ferait.
 */
function simulerNettoyageOffresTerminees() {
  const resultat = _nettoyageOffresTerminees(true);
  const lignes = [`SIMULATION (aucune suppression) — seuil : ${resultat.seuilJours} jours`];
  if (resultat.eligibles.length === 0) {
    lignes.push("Aucune offre à supprimer aujourd'hui.");
  } else {
    lignes.push(`${resultat.eligibles.length} offre(s) SERAIENT supprimées :`);
    resultat.eligibles.forEach(e => {
      lignes.push(`  - "${e.nom}" (${e.id}) — ${e.reservations} réservation(s), terminée le ${e.dateTerminaison.toISOString().slice(0, 10)}`);
    });
  }
  const message = lignes.join("\n");
  console.log(message);
  return message;
}

/**
 * NETTOYAGE RÉEL — supprime définitivement. C'est la fonction visée par le trigger.
 * ⚠️ À n'installer qu'après validation via simulerNettoyageOffresTerminees().
 */
function nettoyerOffresTerminees() {
  const resultat = _nettoyageOffresTerminees(false);
  const message = `Nettoyage : ${resultat.supprimees.length} offre(s) supprimée(s), ${resultat.echecs.length} échec(s) (seuil ${resultat.seuilJours} jours).`;
  console.log(message);
  return message;
}

/**
 * Installe le déclencheur quotidien. Idempotent : les triggers existants pour
 * cette fonction sont supprimés avant d'en créer un nouveau (pas de doublon).
 * ⚠️ Un trigger ne se déclare PAS dans appsscript.json.
 */
function installerTriggerNettoyage() {
  const nomFonction = "nettoyerOffresTerminees";
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === nomFonction) { ScriptApp.deleteTrigger(trigger); supprimes++; }
  });
  ScriptApp.newTrigger(nomFonction).timeBased().everyDays(1).atHour(0).create();
  const message = `Trigger quotidien (00:00) installé pour ${nomFonction}. ${supprimes} ancien(s) trigger(s) retiré(s).`;
  console.log(message);
  loggerOffre("TRIGGER", "", message);
  return message;
}

/** Retire le déclencheur de nettoyage. */
function desinstallerTriggerNettoyage() {
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "nettoyerOffresTerminees") { ScriptApp.deleteTrigger(trigger); supprimes++; }
  });
  const message = `${supprimes} trigger(s) de nettoyage retiré(s).`;
  console.log(message);
  return message;
}

/** Liste les déclencheurs du projet (contrôle visuel). */
function listerTriggersProjet() {
  const triggers = ScriptApp.getProjectTriggers();
  const message = triggers.length === 0
    ? "Aucun trigger installé."
    : triggers.map(t => `- ${t.getHandlerFunction()} (${t.getEventType()})`).join("\n");
  console.log(message);
  return message;
}

/**
 * ----------------------------------------------------------------------------
 * VÉRIFICATION DES ÉTAPES 4 ET 5
 * Le nettoyage n'est testé QU'EN SIMULATION : le test ne déclenche jamais la
 * suppression globale réelle. Il nettoie lui-même ses propres offres.
 * ----------------------------------------------------------------------------
 */
function testerOffresEtapes4et5() {
  const rapport = [];
  const creees = [];

  try {
    const jours = getParametreOffre("X_JOURS_AVANT_SUPPRESSION");

    // --- Jeu d'essai ---
    const active = creerOffre({ nom: "TEST e4 active — à supprimer", type: "Produit", modeSaisie: "Libre" });
    creees.push(active.id);

    const vieille = creerOffre({ nom: "TEST e5 vieille — à supprimer", type: "Evenement" });
    creees.push(vieille.id);
    terminerOffre(vieille.id);
    // On antidate la terminaison à (X + 1) jours => devient éligible.
    const dateAncienne = new Date();
    dateAncienne.setDate(dateAncienne.getDate() - (jours + 1));
    avecVerrouOffre(() => majOffreDansConfig(vieille.id, { dateTerminaison: dateAncienne }));

    const recente = creerOffre({ nom: "TEST e5 récente — à supprimer", type: "Evenement" });
    creees.push(recente.id);
    terminerOffre(recente.id); // terminée aujourd'hui => NON éligible

    const sansDate = creerOffre({ nom: "TEST e5 sans date — à supprimer", type: "Evenement" });
    creees.push(sansDate.id);
    avecVerrouOffre(() => majOffreDansConfig(sansDate.id, { statut: OffresConfig.STATUT_TERMINEE, dateTerminaison: "" }));

    // --- Étape 4 : listing ---
    const initial = getOffresActivesEtTermineesRecentes(2);
    const idsActifs = initial.actives.map(o => o.id);
    if (idsActifs.indexOf(active.id) === -1) throw new Error("ÉCHEC : l'offre active n'apparaît pas dans les actives.");
    if (idsActifs.indexOf(recente.id) !== -1) throw new Error("ÉCHEC : une offre terminée apparaît dans les actives.");
    if (initial.termineesRecentes.length > 2) throw new Error("ÉCHEC : la limite de terminées n'est pas respectée.");
    rapport.push(`Listing : ${initial.actives.length} active(s), ${initial.termineesRecentes.length} terminée(s) affichée(s) sur ${initial.totalTerminees}, hasMore=${initial.hasMoreTerminees}`);

    // Pagination : aucun doublon entre la page 0 et la page 1
    const page0 = getOffresTermineesPaginees(0, 1);
    const page1 = getOffresTermineesPaginees(1, 1);
    if (page0.offres.length && page1.offres.length && page0.offres[0].id === page1.offres[0].id) {
      throw new Error("ÉCHEC : la pagination renvoie deux fois la même offre.");
    }
    rapport.push(`Pagination : page0=${page0.offres.length}, page1=${page1.offres.length}, total=${page0.total}, hasMore=${page0.hasMore}`);

    // --- Étape 5 : simulation ---
    const simulation = _nettoyageOffresTerminees(true);
    const idsEligibles = simulation.eligibles.map(e => e.id);
    if (idsEligibles.indexOf(vieille.id) === -1) throw new Error("ÉCHEC : l'offre antidatée n'est pas éligible au nettoyage.");
    if (idsEligibles.indexOf(recente.id) !== -1) throw new Error("ÉCHEC : une offre terminée aujourd'hui est jugée éligible.");
    if (idsEligibles.indexOf(sansDate.id) !== -1) throw new Error("ÉCHEC GRAVE : une offre sans Date_Terminaison est jugée éligible.");
    if (idsEligibles.indexOf(active.id) !== -1) throw new Error("ÉCHEC GRAVE : une offre ACTIVE est jugée éligible.");
    rapport.push(`Simulation : ${simulation.eligibles.length} éligible(s) — l'antidatée oui, la récente non, la sans-date non, l'active non`);

    // La simulation ne doit RIEN avoir supprimé
    if (!trouverOffreDansConfig(vieille.id)) throw new Error("ÉCHEC GRAVE : la simulation a supprimé une offre !");
    rapport.push("La simulation n'a rien supprimé : OK");

    const message = rapport.join("\n");
    console.log(message);
    return message;

  } finally {
    creees.forEach(id => { try { supprimerOffre(id); } catch (e) {} });
  }
}

/**
 * Modifie les métadonnées d'une offre (nom / type / mode de saisie).
 * Les ARTICLES ne sont volontairement pas gérés ici : leur ajout et surtout leur
 * suppression passent par ajouterArticleOffre / supprimerArticleOffre, cette
 * dernière devant être précédée de l'avertissement avec décompte.
 */
function modifierOffre(idOffre, champs) {
  return avecVerrouOffre(function () {
    const offre = _feuilleDeOffre(idOffre).offre;
    const modifications = {};

    if (champs && champs.nom !== undefined) {
      const nom = String(champs.nom).trim();
      if (!nom) throw new Error("Le nom de l'offre est obligatoire.");
      modifications.nom = nom;
    }

    let typeFinal = offre.type;
    if (champs && champs.type !== undefined) {
      const type = String(champs.type).trim();
      if (OffresConfig.TYPES.indexOf(type) === -1) {
        throw new Error(`Type invalide : "${type}". Attendu : ${OffresConfig.TYPES.join(" ou ")}.`);
      }
      modifications.type = type;
      typeFinal = type;
      // Une offre Evenement n'a pas de mode de saisie.
      if (type === "Evenement") modifications.modeSaisie = "";
    }

    if (champs && champs.modeSaisie !== undefined && typeFinal === "Produit") {
      const mode = String(champs.modeSaisie).trim();
      if (OffresConfig.MODES.indexOf(mode) === -1) {
        throw new Error(`Mode de saisie invalide : "${mode}". Attendu : ${OffresConfig.MODES.join(" ou ")}.`);
      }
      modifications.modeSaisie = mode;
    }

    if (Object.keys(modifications).length === 0) return { modifie: false };
    majOffreDansConfig(idOffre, modifications);
    loggerOffre("MODIFICATION_OFFRE", idOffre, JSON.stringify(modifications));
    return { modifie: true, champs: modifications };
  });
}

/**
 * Renomme une colonne d'article. Les quantités déjà saisies sont CONSERVÉES
 * (on ne touche qu'à l'en-tête) — contrairement à une suppression.
 */
function renommerArticleOffre(idOffre, ancienNom, nouveauNom) {
  return avecVerrouOffre(function () {
    const nouveau = normaliserNomArticle(nouveauNom);
    if (!nouveau) throw new Error("Le nouveau nom de l'article est vide.");

    const feuille = _feuilleDeOffre(idOffre).feuille;
    const colonne = trouverColonneArticle(feuille, ancienNom);
    if (!colonne) throw new Error(`Article "${ancienNom}" introuvable dans cette offre.`);

    // Si le nouveau nom correspond à une AUTRE colonne existante, on refuse :
    // fusionner deux colonnes impliquerait d'additionner les quantités, ce qui
    // n'est pas une simple opération de renommage.
    const conflit = trouverColonneArticle(feuille, nouveau);
    if (conflit && conflit.index !== colonne.index) {
      throw new Error(`Un article "${conflit.nom}" existe déjà dans cette offre.`);
    }

    feuille.getRange(1, colonne.index + 1).setValue(nouveau);
    loggerOffre("RENOMMAGE_ARTICLE", idOffre, `"${colonne.nom}" → "${nouveau}"`);
    return { ancien: colonne.nom, nouveau: nouveau };
  });
}

/**
 * ============================================================================
 * ÉTAPE 6 — MIGRATION DEPUIS L'ANCIENNE ARCHITECTURE
 * ============================================================================
 * Lit les 3 anciennes feuilles et construit Config + une feuille par offre.
 *
 * ⚠️ NE SUPPRIME RIEN de l'ancienne structure : elle reste la source de vérité
 *    tant que le frontend n'a pas basculé (étape 7).
 * ⚠️ À exécuter AVANT la bascule du frontend.
 *
 * IDEMPOTENT : relançable sans créer de doublon (les offres déjà migrées sont
 * ignorées).
 */

/** Colonnes de l'ANCIENNE structure. Dupliquées ici volontairement pour que
 *  Offres.gs ne dépende pas de Code.gs (qui sera supprimé à la fin). */
const MigrationAncien = {
  SHEET_OPERATIONS: "Operations",
  SHEET_RESERVATIONS: "Reservations",
  SHEET_ARTICLES: "Articles",
  COL_OP_ID: 0, COL_OP_NOM: 1, COL_OP_TYPE: 2, COL_OP_MODE: 5, COL_OP_ARTICLES: 6, COL_OP_TERMINEE: 7,
  COL_RES_ID: 0, COL_RES_OP: 1, COL_RES_NOM: 2, COL_RES_PRENOM: 3, COL_RES_CONTACT: 4, COL_RES_ETAT: 5, COL_RES_DATE: 6,
  COL_ART_RES: 1, COL_ART_NOM: 2, COL_ART_QTE: 3
};

/**
 * L'ancienne structure stocke Date_Saisie en TEXTE ("15/07/2024 10:00").
 * On le reconvertit en vraie Date. Retourne null si le format est inconnu.
 */
function _parserDateFrancaise(valeur) {
  if (valeur instanceof Date) return valeur;
  const texte = String(valeur || "").trim();
  if (!texte) return null;
  const m = texte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  return new Date(
    parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
    m[4] ? parseInt(m[4], 10) : 0, m[5] ? parseInt(m[5], 10) : 0
  );
}

/** Lit une ancienne feuille (tableau de lignes, en-tête compris). */
function _lireAncienneFeuille(nom) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);
  if (!feuille || feuille.getLastRow() < 1) return [];
  return feuille.getDataRange().getValues();
}

/**
 * Exécute la migration.
 * Les offres déjà TERMINÉES dans l'ancienne structure n'ont pas de date de
 * terminaison (la colonne n'existait pas) : on leur attribue la DATE DU JOUR,
 * ce qui leur donne un cycle de vie défini (suppression X jours plus tard).
 */
function migrerVersNouvelleArchitecture() {
  return avecVerrouOffre(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureConfigSheet();
    ensureLogsSheet();

    const opsData = _lireAncienneFeuille(MigrationAncien.SHEET_OPERATIONS);
    if (opsData.length < 2) throw new Error(`Feuille "${MigrationAncien.SHEET_OPERATIONS}" vide ou absente : rien à migrer.`);
    const resData = _lireAncienneFeuille(MigrationAncien.SHEET_RESERVATIONS);
    const artData = _lireAncienneFeuille(MigrationAncien.SHEET_ARTICLES);

    // --- Index : articles par réservation (quantités cumulées si doublons) ---
    const articlesParRes = {};
    for (let i = 1; i < artData.length; i++) {
      const idRes = String(artData[i][MigrationAncien.COL_ART_RES] || "").trim();
      const nomArticle = normaliserNomArticle(artData[i][MigrationAncien.COL_ART_NOM]);
      const quantite = parseInt(artData[i][MigrationAncien.COL_ART_QTE], 10);
      if (!idRes || !nomArticle || isNaN(quantite) || quantite <= 0) continue;
      const cle = cleComparaisonArticle(nomArticle);
      if (!articlesParRes[idRes]) articlesParRes[idRes] = {};
      if (!articlesParRes[idRes][cle]) articlesParRes[idRes][cle] = { nom: nomArticle, quantite: 0 };
      articlesParRes[idRes][cle].quantite += quantite;
    }

    // --- Index : réservations par offre ---
    const resParOffre = {};
    const orphelines = [];
    const idsOffresConnues = {};
    for (let i = 1; i < opsData.length; i++) {
      const id = String(opsData[i][MigrationAncien.COL_OP_ID] || "").trim();
      if (id) idsOffresConnues[id] = true;
    }
    for (let i = 1; i < resData.length; i++) {
      const idOffre = String(resData[i][MigrationAncien.COL_RES_OP] || "").trim();
      const idRes = String(resData[i][MigrationAncien.COL_RES_ID] || "").trim();
      if (!idRes) continue;
      if (!idOffre || !idsOffresConnues[idOffre]) { orphelines.push(idRes); continue; }
      if (!resParOffre[idOffre]) resParOffre[idOffre] = [];
      resParOffre[idOffre].push(resData[i]);
    }

    const rapport = { migrees: [], ignorees: [], anomalies: [], reservationsOrphelines: orphelines.length };
    const dateMigration = new Date();

    // --- Migration offre par offre ---
    for (let i = 1; i < opsData.length; i++) {
      const ligneOp = opsData[i];
      const id = String(ligneOp[MigrationAncien.COL_OP_ID] || "").trim();
      if (!id) continue;

      const nom = String(ligneOp[MigrationAncien.COL_OP_NOM] || "").trim() || id;
      let type = String(ligneOp[MigrationAncien.COL_OP_TYPE] || "").trim();
      if (OffresConfig.TYPES.indexOf(type) === -1) {
        rapport.anomalies.push(`Offre ${id} : type "${type}" inconnu → "Produit".`);
        type = "Produit";
      }
      let modeSaisie = "";
      if (type === "Produit") {
        modeSaisie = String(ligneOp[MigrationAncien.COL_OP_MODE] || "").trim();
        if (OffresConfig.MODES.indexOf(modeSaisie) === -1) {
          rapport.anomalies.push(`Offre ${id} : mode "${modeSaisie}" inconnu → "Libre".`);
          modeSaisie = "Libre";
        }
      }
      const estTerminee = String(ligneOp[MigrationAncien.COL_OP_TERMINEE] || "").toLowerCase() === "true";
      const nomFeuille = nomFeuilleDeOffre(id);

      // --- Idempotence ---
      const dansConfig = trouverOffreDansConfig(id);
      const feuilleExistante = ss.getSheetByName(nomFeuille);
      if (dansConfig && feuilleExistante) { rapport.ignorees.push(id); continue; }
      if (feuilleExistante && !dansConfig) {
        // Trace d'une exécution précédente interrompue : l'ancienne structure
        // reste la source de vérité, on repart proprement.
        rapport.anomalies.push(`Offre ${id} : feuille orpheline sans entrée Config → recréée.`);
        ss.deleteSheet(feuilleExistante);
      }

      // --- Colonnes d'articles : prédéfinis puis ceux réellement utilisés ---
      const reservations = resParOffre[id] || [];
      const nomsArticles = [];
      const vus = {};
      const ajouterArticle = nomArticle => {
        const propre = normaliserNomArticle(nomArticle);
        if (!propre) return;
        const cle = cleComparaisonArticle(propre);
        if (vus[cle]) return;
        vus[cle] = true;
        nomsArticles.push(propre);
      };
      if (type === "Produit") {
        if (modeSaisie === "Predefini") {
          _normaliserListeArticles(ligneOp[MigrationAncien.COL_OP_ARTICLES]).forEach(ajouterArticle);
        }
        const decouverts = [];
        reservations.forEach(ligneRes => {
          const idRes = String(ligneRes[MigrationAncien.COL_RES_ID] || "").trim();
          const articles = articlesParRes[idRes];
          if (!articles) return;
          Object.keys(articles).forEach(cle => decouverts.push(articles[cle].nom));
        });
        decouverts.sort((a, b) => a.localeCompare(b));
        decouverts.forEach(ajouterArticle);
      }

      // --- Création de la feuille ---
      const enTetes = OffresConfig.EN_TETES_FIXES.concat(nomsArticles);
      const feuille = ss.insertSheet(nomFeuille);
      feuille.getRange(1, 1, 1, enTetes.length).setValues([enTetes]).setFontWeight("bold");
      feuille.setFrozenRows(1);

      const indexParCle = {};
      nomsArticles.forEach((nomArticle, position) => {
        indexParCle[cleComparaisonArticle(nomArticle)] = OffresConfig.NB_COLONNES_FIXES + position;
      });

      // --- Lignes de réservation (écrites en un seul setValues) ---
      const lignes = [];
      reservations.forEach(ligneRes => {
        const idRes = String(ligneRes[MigrationAncien.COL_RES_ID] || "").trim();
        const ligne = new Array(enTetes.length).fill("");
        ligne[OffresConfig.COL_RES_ID] = idRes;
        ligne[OffresConfig.COL_RES_NOM] = String(ligneRes[MigrationAncien.COL_RES_NOM] || "");
        ligne[OffresConfig.COL_RES_PRENOM] = String(ligneRes[MigrationAncien.COL_RES_PRENOM] || "");
        ligne[OffresConfig.COL_RES_CONTACT] = String(ligneRes[MigrationAncien.COL_RES_CONTACT] || "");
        const etat = String(ligneRes[MigrationAncien.COL_RES_ETAT] || "").trim();
        ligne[OffresConfig.COL_RES_STATUT] =
          OffresConfig.STATUTS_RESERVATION.indexOf(etat) === -1 ? OffresConfig.STATUTS_RESERVATION[0] : etat;

        const dateSaisie = _parserDateFrancaise(ligneRes[MigrationAncien.COL_RES_DATE]);
        if (dateSaisie) {
          ligne[OffresConfig.COL_RES_DATE_SAISIE] = dateSaisie;
        } else {
          // Format inconnu : on conserve la valeur brute plutôt que de la perdre.
          ligne[OffresConfig.COL_RES_DATE_SAISIE] = String(ligneRes[MigrationAncien.COL_RES_DATE] || "");
          if (ligneRes[MigrationAncien.COL_RES_DATE]) {
            rapport.anomalies.push(`Réservation ${idRes} : date "${ligneRes[MigrationAncien.COL_RES_DATE]}" non convertie.`);
          }
        }

        const articles = articlesParRes[idRes];
        if (articles) {
          Object.keys(articles).forEach(cle => {
            const index = indexParCle[cle];
            if (index !== undefined) ligne[index] = articles[cle].quantite;
          });
        }
        lignes.push(ligne);
      });
      if (lignes.length > 0) {
        feuille.getRange(2, 1, lignes.length, enTetes.length).setValues(lignes);
      }

      // --- Entrée Config ---
      // L'ancienne structure n'a pas de date de terminaison : on prend la date
      // de migration, pour que les offres déjà terminées aient un cycle de vie.
      if (dansConfig) {
        majOffreDansConfig(id, {
          nom: nom, type: type, modeSaisie: modeSaisie,
          statut: estTerminee ? OffresConfig.STATUT_TERMINEE : OffresConfig.STATUT_EN_COURS,
          dateTerminaison: estTerminee ? dateMigration : ""
        });
      } else {
        ajouterOffreDansConfig({
          id: id, nom: nom, type: type, modeSaisie: modeSaisie,
          statut: estTerminee ? OffresConfig.STATUT_TERMINEE : OffresConfig.STATUT_EN_COURS,
          dateTerminaison: estTerminee ? dateMigration : "",
          nomFeuille: nomFeuille
        });
      }

      rapport.migrees.push({ id: id, nom: nom, reservations: lignes.length, articles: nomsArticles.length });
    }

    loggerOffre("MIGRATION", "",
      `${rapport.migrees.length} offre(s) migrée(s), ${rapport.ignorees.length} déjà présente(s), ${rapport.anomalies.length} anomalie(s)`);

    const lignesRapport = [
      `MIGRATION terminée — ${rapport.migrees.length} offre(s) migrée(s), ${rapport.ignorees.length} déjà présente(s).`
    ];
    rapport.migrees.forEach(m => lignesRapport.push(`  + "${m.nom}" (${m.id}) : ${m.reservations} réservation(s), ${m.articles} article(s)`));
    if (rapport.reservationsOrphelines > 0) {
      lignesRapport.push(`  ⚠️ ${rapport.reservationsOrphelines} réservation(s) orpheline(s) (offre inexistante) NON migrée(s).`);
    }
    if (rapport.anomalies.length > 0) {
      lignesRapport.push(`  ⚠️ ${rapport.anomalies.length} anomalie(s) :`);
      rapport.anomalies.forEach(a => lignesRapport.push(`     - ${a}`));
    }
    lignesRapport.push("");
    lignesRapport.push("L'ancienne structure n'a PAS été modifiée. Lancez verifierMigration() pour contrôler.");

    const message = lignesRapport.join("\n");
    console.log(message);
    return message;
  });
}

/**
 * Compare l'ANCIENNE et la NOUVELLE structure : nombre d'offres, nombre de
 * réservations par offre, et total par article. C'est le filet de sécurité qui
 * autorise (ou non) la bascule du frontend.
 */
function verifierMigration() {
  const opsData = _lireAncienneFeuille(MigrationAncien.SHEET_OPERATIONS);
  const resData = _lireAncienneFeuille(MigrationAncien.SHEET_RESERVATIONS);
  const artData = _lireAncienneFeuille(MigrationAncien.SHEET_ARTICLES);

  // --- Totaux attendus, calculés depuis l'ancienne structure ---
  const attenduParOffre = {}; // idOffre -> { nom, reservations, articles: {cle: total} }
  const offreDeReservation = {};

  for (let i = 1; i < opsData.length; i++) {
    const id = String(opsData[i][MigrationAncien.COL_OP_ID] || "").trim();
    if (!id) continue;
    attenduParOffre[id] = { nom: String(opsData[i][MigrationAncien.COL_OP_NOM] || ""), reservations: 0, articles: {} };
  }
  for (let i = 1; i < resData.length; i++) {
    const idRes = String(resData[i][MigrationAncien.COL_RES_ID] || "").trim();
    const idOffre = String(resData[i][MigrationAncien.COL_RES_OP] || "").trim();
    if (!idRes || !attenduParOffre[idOffre]) continue;
    attenduParOffre[idOffre].reservations++;
    offreDeReservation[idRes] = idOffre;
  }
  for (let i = 1; i < artData.length; i++) {
    const idRes = String(artData[i][MigrationAncien.COL_ART_RES] || "").trim();
    const idOffre = offreDeReservation[idRes];
    if (!idOffre) continue;
    const nomArticle = normaliserNomArticle(artData[i][MigrationAncien.COL_ART_NOM]);
    const quantite = parseInt(artData[i][MigrationAncien.COL_ART_QTE], 10);
    if (!nomArticle || isNaN(quantite) || quantite <= 0) continue;
    const cle = cleComparaisonArticle(nomArticle);
    attenduParOffre[idOffre].articles[cle] = (attenduParOffre[idOffre].articles[cle] || 0) + quantite;
  }

  // --- Comparaison avec la nouvelle structure ---
  const ecarts = [];
  const idsAnciens = Object.keys(attenduParOffre);
  let offresControlees = 0;

  idsAnciens.forEach(id => {
    const attendu = attenduParOffre[id];
    let obtenu;
    try {
      obtenu = getOffreById(id);
    } catch (e) {
      ecarts.push(`Offre "${attendu.nom}" (${id}) : ABSENTE de la nouvelle structure (${e.message}).`);
      return;
    }
    offresControlees++;

    if (obtenu.reservations.length !== attendu.reservations) {
      ecarts.push(`Offre "${attendu.nom}" : ${obtenu.reservations.length} réservation(s) migrée(s) contre ${attendu.reservations} attendue(s).`);
    }

    const totauxObtenus = {};
    obtenu.resume.forEach(r => { totauxObtenus[cleComparaisonArticle(r.nom)] = r.total; });
    Object.keys(attendu.articles).forEach(cle => {
      const attenduTotal = attendu.articles[cle];
      const obtenuTotal = totauxObtenus[cle] || 0;
      if (obtenuTotal !== attenduTotal) {
        ecarts.push(`Offre "${attendu.nom}", article "${cle}" : total ${obtenuTotal} contre ${attenduTotal} attendu.`);
      }
    });
  });

  const nouvelles = lireConfigOffres();
  const enTrop = nouvelles.filter(o => idsAnciens.indexOf(o.id) === -1);
  enTrop.forEach(o => ecarts.push(`Offre "${o.nom}" (${o.id}) présente dans Config mais absente de l'ancienne structure.`));

  const lignes = [
    `VÉRIFICATION — ${idsAnciens.length} offre(s) dans l'ancienne structure, ${nouvelles.length} dans Config.`,
    `${offresControlees} offre(s) contrôlée(s) en détail (réservations + totaux par article).`
  ];
  if (ecarts.length === 0) {
    lignes.push("");
    lignes.push("✅ AUCUN ÉCART : la migration est fidèle. La bascule du frontend peut être envisagée.");
  } else {
    lignes.push("");
    lignes.push(`❌ ${ecarts.length} ÉCART(S) DÉTECTÉ(S) — NE PAS BASCULER :`);
    ecarts.forEach(e => lignes.push(`  - ${e}`));
  }

  const message = lignes.join("\n");
  console.log(message);
  return message;
}
