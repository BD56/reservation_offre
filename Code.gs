function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Application de Réservations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Fonction utilitaire pour inclure d'autres fichiers (CSS/JS) plus tard
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- OUTILS ---
const ETATS_VALIDES = ["Réservé", "Contacté", "Retrait", "Annulé"];

// Exécute une écriture sous verrou pour éviter que deux utilisateurs se marchent dessus
function avecVerrou(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("L'application est occupée, veuillez réessayer dans quelques secondes.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Force l'enregistrement en texte : garde le 0 des téléphones et empêche l'interprétation en formule (=, +, -)
function texte(valeur) {
  const s = String(valeur == null ? "" : valeur).trim();
  return s ? "'" + s : "";
}

// Formate une cellule date sans planter si elle contient du texte
function formaterDate(valeur, format) {
  if (!valeur) return "";
  const d = (valeur instanceof Date) ? valeur : new Date(valeur);
  if (isNaN(d.getTime())) return String(valeur);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), format);
}

// Les anciens téléphones enregistrés en nombre ont perdu leur 0 initial
function formaterContact(valeur) {
  if (typeof valeur === "number") {
    const s = String(valeur);
    return s.length === 9 ? "0" + s : s;
  }
  return String(valeur || "");
}

function operationExiste(idOp) {
  const sheetOps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Operations");
  return !!sheetOps.getRange("A:A").createTextFinder(String(idOp).trim()).matchEntireCell(true).findNext();
}

function verifierOffre(data) {
  if (!data || !String(data.nom || "").trim()) throw new Error("Le nom de l'offre est obligatoire.");
  if (data.dateDebut && data.dateFin && data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }
  if (data.type === "Produit" && data.modeSaisie === "Predefini" && !String(data.articlesPredefinis || "").replace(/,/g, "").trim()) {
    throw new Error("Le mode prédéfini nécessite au moins un article.");
  }
}

// --- LIRE LES OPÉRATIONS ---
function getOperationsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetOps = ss.getSheetByName("Operations");
  const sheetRes = ss.getSheetByName("Reservations");

  if (!sheetOps || !sheetRes) return [];

  const dataOps = sheetOps.getDataRange().getValues();
  const dataRes = sheetRes.getDataRange().getValues();

  const ops = dataOps.slice(1);
  const res = dataRes.slice(1);

  // On ne compte que les réservations actives (les annulées sont exclues)
  const compteReservations = {};
  res.forEach(row => {
    const idOp = String(row[1]).trim();
    if (idOp && row[5] !== "Annulé") {
      compteReservations[idOp] = (compteReservations[idOp] || 0) + 1;
    }
  });

  const result = ops.map(row => {
    const id = String(row[0]).trim();
    return {
      id: id,
      nom: String(row[1] || ""),
      type: String(row[2] || ""),
      dateDebut: formaterDate(row[3], "dd/MM/yyyy"),
      dateFin: formaterDate(row[4], "dd/MM/yyyy"),
      modeSaisie: row[5] || "Libre",
      articlesPredefinis: String(row[6] || ""),
      count: compteReservations[id] || 0
    };
  }).filter(op => op.id !== "");

  return result;
}


// --- SAUVEGARDER UNE NOUVELLE RÉSERVATION ---
function saveReservation(data) {
  if (!data || !data.operationId) throw new Error("Aucune offre sélectionnée.");
  if (!String(data.nom || "").trim() || !String(data.prenom || "").trim()) {
    throw new Error("Le nom et le prénom sont obligatoires.");
  }
  if (!String(data.telephone || "").trim() && !String(data.email || "").trim()) {
    throw new Error("Un téléphone ou un email est obligatoire.");
  }

  return avecVerrou(() => {
    if (!operationExiste(data.operationId)) {
      throw new Error("Cette offre n'existe plus. Rechargez la page.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetRes = ss.getSheetByName("Reservations");
    const sheetArt = ss.getSheetByName("Articles");

    const idRes = "RES-" + new Date().getTime();
    const dateSaisie = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    let contact = String(data.telephone || "").trim();
    const email = String(data.email || "").trim();
    if (email) contact += (contact ? " / " : "") + email;

    sheetRes.appendRow([idRes, data.operationId, texte(data.nom), texte(data.prenom), texte(contact), "Réservé", dateSaisie]);

    (data.articles || []).forEach(art => {
      const qte = parseInt(art.quantite, 10);
      if (!String(art.nom || "").trim() || !(qte > 0)) return;
      const idArt = "ART-" + Utilities.getUuid().substring(0, 8);
      sheetArt.appendRow([idArt, idRes, texte(art.nom), qte]);
    });

    return true;
  });
}


// --- SUPPRIMER UNE OPÉRATION ET TOUTES SES RÉSERVATIONS (Suppression en cascade) ---
function deleteOperation(idOp) {
  return avecVerrou(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cible = String(idOp).trim();

    // 1. Supprimer l'opération
    const sheetOps = ss.getSheetByName("Operations");
    const dataOps = sheetOps.getDataRange().getValues();
    let operationTrouvee = false;

    for (let i = dataOps.length - 1; i > 0; i--) {
      if (String(dataOps[i][0]).trim() === cible) {
        sheetOps.deleteRow(i + 1);
        operationTrouvee = true;
        break;
      }
    }

    if (!operationTrouvee) {
      throw new Error("L'ID '" + idOp + "' est introuvable dans l'onglet Operations.");
    }

    // 2. Trouver et supprimer les réservations liées, et lister leurs IDs
    const sheetRes = ss.getSheetByName("Reservations");
    const dataRes = sheetRes.getDataRange().getValues();
    const idsReservationsASupprimer = {};

    // On boucle à l'envers quand on supprime des lignes pour ne pas décaler les index
    for (let i = dataRes.length - 1; i > 0; i--) {
      if (String(dataRes[i][1]).trim() === cible) {
        idsReservationsASupprimer[String(dataRes[i][0]).trim()] = true; // On stocke l'ID de la réservation
        sheetRes.deleteRow(i + 1); // On supprime la ligne
      }
    }

    // 3. Trouver et supprimer les articles liés à ces réservations
    if (Object.keys(idsReservationsASupprimer).length > 0) {
      const sheetArt = ss.getSheetByName("Articles");
      const dataArt = sheetArt.getDataRange().getValues();

      for (let i = dataArt.length - 1; i > 0; i--) {
        if (idsReservationsASupprimer[String(dataArt[i][1]).trim()]) {
          sheetArt.deleteRow(i + 1);
        }
      }
    }

    return true;
  });
}

// --- CRÉER UNE NOUVELLE OFFRE ---
function saveOperation(data) {
  verifierOffre(data);

  return avecVerrou(() => {
    const sheetOps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Operations");

    // Création d'un ID unique (ex: OP-168...)
    const newId = "OP-" + new Date().getTime();

    // On écrit la ligne. Ordre : ID_Operation, Nom, Type, Date_Debut, Date_Fin, Mode_Saisie, Articles_Predefinis
    sheetOps.appendRow([
      newId,
      texte(data.nom),
      data.type,
      data.dateDebut,
      data.dateFin,
      data.modeSaisie,
      texte(data.articlesPredefinis)
    ]);

    return true;
  });
}

// --- RÉCUPÉRER LES DÉTAILS D'UNE OFFRE ET SES RÉSERVATIONS ---
function getOperationDetails(idOp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cible = String(idOp).trim();

  // 1. Chercher l'opération
  const sheetOps = ss.getSheetByName("Operations");
  const dataOps = sheetOps.getDataRange().getValues();
  let opData = null;

  for (let i = 1; i < dataOps.length; i++) {
    if (String(dataOps[i][0]).trim() === cible) {
      opData = {
        id: String(dataOps[i][0] || ""),
        nom: String(dataOps[i][1] || ""),
        type: String(dataOps[i][2] || ""),
        dateDebut: formaterDate(dataOps[i][3], "yyyy-MM-dd"),
        dateFin: formaterDate(dataOps[i][4], "yyyy-MM-dd"),
        modeSaisie: String(dataOps[i][5] || ""),
        articlesPredefinis: String(dataOps[i][6] || "")
      };
      break;
    }
  }

  if (!opData) throw new Error("Opération introuvable.");

  // 2. Chercher les réservations
  const sheetRes = ss.getSheetByName("Reservations");
  const dataRes = sheetRes.getDataRange().getValues();
  const reservations = [];

  for (let i = 1; i < dataRes.length; i++) {
    if (String(dataRes[i][1]).trim() === cible) {
      reservations.push({
        idRes: String(dataRes[i][0] || "").trim(),
        nom: String(dataRes[i][2] || ""),
        prenom: String(dataRes[i][3] || ""),
        contact: formaterContact(dataRes[i][4]),
        etat: String(dataRes[i][5] || ""),
        dateSaisie: formaterDate(dataRes[i][6], "dd/MM/yyyy HH:mm"),
        articles: []
      });
    }
  }

  // 3. Rattacher les articles à chaque réservation
  // (le résumé des quantités est calculé côté page, pour tenir compte des changements d'état)
  if (reservations.length > 0) {
    const parId = {};
    reservations.forEach(res => parId[res.idRes] = res);

    const dataArt = ss.getSheetByName("Articles").getDataRange().getValues();
    for (let i = 1; i < dataArt.length; i++) {
      const res = parId[String(dataArt[i][1]).trim()];
      const nomArt = String(dataArt[i][2] || "").trim();
      if (res && nomArt) {
        res.articles.push({ nom: nomArt, quantite: parseInt(dataArt[i][3], 10) || 0 });
      }
    }
  }

  return { operation: opData, reservations: reservations };
}

// --- METTRE À JOUR UNE OPÉRATION ---
function updateOperation(data) {
  verifierOffre(data);

  return avecVerrou(() => {
    const sheetOps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Operations");
    const dataOps = sheetOps.getDataRange().getValues();

    for (let i = 1; i < dataOps.length; i++) {
      if (String(dataOps[i][0]).trim() === String(data.id).trim()) {
        // On met à jour les colonnes B à G (Colonnes 2 à 7) pour cette ligne
        sheetOps.getRange(i + 1, 2, 1, 6).setValues([[
          texte(data.nom), data.type, data.dateDebut, data.dateFin, data.modeSaisie, texte(data.articlesPredefinis)
        ]]);
        return true;
      }
    }
    throw new Error("Impossible de trouver l'opération pour la mettre à jour.");
  });
}

// --- METTRE À JOUR LE STATUT D'UNE RÉSERVATION ---
function updateReservationStatus(idRes, newStatus) {
  if (ETATS_VALIDES.indexOf(newStatus) === -1) throw new Error("État inconnu : " + newStatus);

  return avecVerrou(() => {
    const sheetRes = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Reservations");
    const data = sheetRes.getDataRange().getValues();

    // On cherche la ligne de la réservation
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idRes).trim()) {
        // La colonne Etat est la F (donc la 6ème colonne)
        sheetRes.getRange(i + 1, 6).setValue(newStatus);
        return true;
      }
    }
    throw new Error("Réservation introuvable pour la mise à jour.");
  });
}
