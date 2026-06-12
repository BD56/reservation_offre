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

// --- LIRE LES OPÉRATIONS (Il manquait cette fonction !) ---
function getOperationsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetOps = ss.getSheetByName("Operations");
  const sheetRes = ss.getSheetByName("Reservations");

  if (!sheetOps || !sheetRes) return [];

  const dataOps = sheetOps.getDataRange().getValues();
  const dataRes = sheetRes.getDataRange().getValues();

  const ops = dataOps.slice(1);
  const res = dataRes.slice(1);

  const compteReservations = {};
  res.forEach(row => {
    const idOp = row[1]; 
    if (idOp) {
      compteReservations[idOp] = (compteReservations[idOp] || 0) + 1;
    }
  });

  const result = ops.map(row => {
    const id = row[0];
    return {
      id: id,
      nom: row[1],
      type: row[2],
      dateDebut: row[3] ? Utilities.formatDate(new Date(row[3]), Session.getScriptTimeZone(), "dd/MM/yyyy") : "",
      dateFin: row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), "dd/MM/yyyy") : "",
      modeSaisie: row[5] || "Libre",
      articlesPredefinis: row[6] || "",
      count: compteReservations[id] || 0
    };
  }).filter(op => op.id !== ""); 

  return result; 
}


// --- SAUVEGARDER UNE NOUVELLE RÉSERVATION ---
function saveReservation(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRes = ss.getSheetByName("Reservations");
  const sheetArt = ss.getSheetByName("Articles");

  const idRes = "RES-" + new Date().getTime();
  const dateSaisie = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  
  let contact = data.telephone;
  if (data.email) contact += (contact ? " / " : "") + data.email;

  sheetRes.appendRow([idRes, data.operationId, data.nom, data.prenom, contact, "Réservé", dateSaisie]);

  if (data.articles && data.articles.length > 0) {
    data.articles.forEach(art => {
      const idArt = "ART-" + Utilities.getUuid().substring(0,8); 
      sheetArt.appendRow([idArt, idRes, art.nom, art.quantite]);
    });
  }
  
  return true; 
}


// --- SUPPRIMER UNE OPÉRATION ET TOUTES SES RÉSERVATIONS (Suppression en cascade) ---
function deleteOperation(idOp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Supprimer l'opération
  const sheetOps = ss.getSheetByName("Operations");
  const dataOps = sheetOps.getDataRange().getValues();
  let operationTrouvee = false;
  
  for (let i = dataOps.length - 1; i > 0; i--) {
    if (String(dataOps[i][0]).trim() === String(idOp).trim()) {
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
  let idsReservationsASupprimer = [];
  
  // On boucle à l'envers quand on supprime des lignes pour ne pas décaler les index
  for (let i = dataRes.length - 1; i > 0; i--) {
    if (String(dataRes[i][1]).trim() === String(idOp).trim()) {
      idsReservationsASupprimer.push(String(dataRes[i][0]).trim()); // On stocke l'ID de la réservation
      sheetRes.deleteRow(i + 1); // On supprime la ligne
    }
  }

  // 3. Trouver et supprimer les articles liés à ces réservations
  if (idsReservationsASupprimer.length > 0) {
    const sheetArt = ss.getSheetByName("Articles");
    const dataArt = sheetArt.getDataRange().getValues();
    
    for (let i = dataArt.length - 1; i > 0; i--) {
      let idResDeLArticle = String(dataArt[i][1]).trim();
      if (idsReservationsASupprimer.includes(idResDeLArticle)) {
        sheetArt.deleteRow(i + 1);
      }
    }
  }

  return true;
}

// --- CRÉER UNE NOUVELLE OFFRE ---
function saveOperation(data) {
  const sheetOps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Operations");
  
  // Création d'un ID unique (ex: OP-168...)
  const newId = "OP-" + new Date().getTime(); 
  
  // On écrit la ligne. Ordre : ID_Operation, Nom, Type, Date_Debut, Date_Fin, Mode_Saisie, Articles_Predefinis
  sheetOps.appendRow([
    newId,
    data.nom,
    data.type,
    data.dateDebut,
    data.dateFin,
    data.modeSaisie,
    data.articlesPredefinis
  ]);
  
  return true;
}

// --- RÉCUPÉRER LES DÉTAILS D'UNE OFFRE ET SES RÉSERVATIONS ---
function getOperationDetails(idOp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Chercher l'opération
  const sheetOps = ss.getSheetByName("Operations");
  const dataOps = sheetOps.getDataRange().getValues();
  let opData = null;
  
  for(let i=1; i<dataOps.length; i++) {
    if(String(dataOps[i][0]).trim() === String(idOp).trim()) {
      let dDebut = dataOps[i][3];
      let dFin = dataOps[i][4];
      opData = {
        id: String(dataOps[i][0] || ""),
        nom: String(dataOps[i][1] || ""),
        type: String(dataOps[i][2] || ""),
        dateDebut: dDebut ? Utilities.formatDate(new Date(dDebut), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
        dateFin: dFin ? Utilities.formatDate(new Date(dFin), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
        modeSaisie: String(dataOps[i][5] || ""),
        articlesPredefinis: String(dataOps[i][6] || "")
      };
      break;
    }
  }
  
  if(!opData) throw new Error("Opération introuvable.");

  // 2. Chercher les réservations
  const sheetRes = ss.getSheetByName("Reservations");
  const dataRes = sheetRes.getDataRange().getValues();
  let reservations = [];
  
  for(let i=1; i<dataRes.length; i++) {
    if(String(dataRes[i][1]).trim() === String(idOp).trim()) {
      let dSaisie = dataRes[i][6];
      let texteDateSaisie = (dSaisie instanceof Date) ? Utilities.formatDate(dSaisie, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : String(dSaisie || "");

      reservations.push({
        idRes: String(dataRes[i][0] || ""),
        nom: String(dataRes[i][2] || ""),
        prenom: String(dataRes[i][3] || ""),
        contact: String(dataRes[i][4] || ""),
        etat: String(dataRes[i][5] || ""),
        dateSaisie: texteDateSaisie,
        articlesText: ""
      });
    }
  }

  // 3. Chercher les articles et calculer le RÉSUMÉ DES QUANTITÉS
  let resumeArticles = {}; 

  if(reservations.length > 0) {
    const sheetArt = ss.getSheetByName("Articles");
    const dataArt = sheetArt.getDataRange().getValues();
    
    reservations.forEach(res => {
      const articlesClient = dataArt.filter(row => String(row[1]) === String(res.idRes));
      res.articlesText = articlesClient.map(row => `${row[3]}x ${row[2]}`).join(', ');

      // On additionne les quantités pour le résumé global
      articlesClient.forEach(art => {
        let nomArt = String(art[2]).trim();
        let qte = parseInt(art[3]) || 0;
        if(nomArt) {
          resumeArticles[nomArt] = (resumeArticles[nomArt] || 0) + qte;
        }
      });
    });
  }

  // On transforme le dictionnaire de résumé en une petite liste facile à lire pour la page web
  let resumeArray = Object.keys(resumeArticles).map(nom => {
    return { nom: nom, total: resumeArticles[nom] };
  });
  resumeArray.sort((a,b) => a.nom.localeCompare(b.nom)); // Tri alphabétique

  // On renvoie tout !
  return { operation: opData, reservations: reservations, resume: resumeArray };
}

// --- METTRE À JOUR UNE OPÉRATION ---
function updateOperation(data) {
  const sheetOps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Operations");
  const dataOps = sheetOps.getDataRange().getValues();
  
  for (let i = 1; i < dataOps.length; i++) {
    if (String(dataOps[i][0]).trim() === String(data.id).trim()) {
      // On met à jour les colonnes B à G (Colonnes 2 à 7) pour cette ligne
      sheetOps.getRange(i + 1, 2, 1, 6).setValues([[
        data.nom, data.type, data.dateDebut, data.dateFin, data.modeSaisie, data.articlesPredefinis
      ]]);
      return true;
    }
  }
  throw new Error("Impossible de trouver l'opération pour la mettre à jour.");
}
// --- METTRE À JOUR LE STATUT D'UNE RÉSERVATION ---
function updateReservationStatus(idRes, newStatus) {
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
}
