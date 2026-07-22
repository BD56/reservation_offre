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
  const feuille = contexte.feuille;
  const offre = contexte.offre;
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
        dateSaisie: (dateSaisie instanceof Date) ? dateSaisie : null,
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
      statut: offre.statut, dateTerminaison: offre.dateTerminaison,
      dateSuppressionPrevue: calculerDateSuppression(offre.dateTerminaison),
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
        dateTerminaison: trouve.offre.dateTerminaison,
        dateSuppressionPrevue: calculerDateSuppression(trouve.offre.dateTerminaison)
      };
    }

    const maintenant = new Date();
    majOffreDansConfig(idOffre, { statut: OffresConfig.STATUT_TERMINEE, dateTerminaison: maintenant });
    const dateSuppression = calculerDateSuppression(maintenant);

    loggerOffre("TERMINAISON_OFFRE", idOffre,
      `"${trouve.offre.nom}" — suppression prévue le ${dateSuppression ? dateSuppression.toISOString().slice(0, 10) : "?"}`);

    return { dejaTerminee: false, dateTerminaison: maintenant, dateSuppressionPrevue: dateSuppression };
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
