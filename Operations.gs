// Offres (onglet « Operations ») : liste, détail, création, modification, suppression.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Operations_() {
  return "2026.10.14-1959";
}

function verifierOffre_(data) {
  if (!data || !String(data.nom || "").trim()) throw new Error("Le nom de l'offre est obligatoire.");
  if (data.dateDebut && data.dateFin && data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }
  if (
    data.type === "Produit" &&
    data.modeSaisie === "Predefini" &&
    !String(data.articlesPredefinis || "")
      .replace(/,/g, "")
      .trim()
  ) {
    throw new Error("Le mode prédéfini nécessite au moins un article.");
  }
}

function operationExiste_(idOp) {
  const cible = String(idOp).trim();
  return lignes_(FEUILLE_OPERATIONS).some(function (row) {
    return String(row[OP.ID]).trim() === cible;
  });
}

// --- LIRE LES OPÉRATIONS ---
function getOperationsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(FEUILLE_OPERATIONS) || !ss.getSheetByName(FEUILLE_RESERVATIONS)) return [];

  // On ne compte que les réservations actives (les annulées sont exclues)
  const compteReservations = {};
  lignes_(FEUILLE_RESERVATIONS).forEach(function (row) {
    const idOp = String(row[RES.OP]).trim();
    if (idOp && row[RES.ETAT] !== ETAT_ANNULE) {
      compteReservations[idOp] = (compteReservations[idOp] || 0) + 1;
    }
  });

  return lignes_(FEUILLE_OPERATIONS)
    .map(function (row) {
      const id = String(row[OP.ID]).trim();
      return {
        id: id,
        nom: String(row[OP.NOM] || ""),
        type: String(row[OP.TYPE] || ""),
        dateDebut: formaterDate_(row[OP.DEBUT], "dd/MM/yyyy"),
        dateFin: formaterDate_(row[OP.FIN], "dd/MM/yyyy"),
        modeSaisie: row[OP.MODE] || "Libre",
        articlesPredefinis: String(row[OP.ARTICLES] || ""),
        count: compteReservations[id] || 0,
      };
    })
    .filter(function (op) {
      return op.id !== "";
    });
}

// --- RÉCUPÉRER LES DÉTAILS D'UNE OFFRE ET SES RÉSERVATIONS ---
// Le résumé des quantités est calculé côté page (il suit les changements d'état).
function getOperationDetails(idOp) {
  const cible = String(idOp).trim();

  // 1. Chercher l'opération
  const row = lignes_(FEUILLE_OPERATIONS).find(function (r) {
    return String(r[OP.ID]).trim() === cible;
  });
  if (!row) throw new Error("Opération introuvable.");
  const opData = {
    id: String(row[OP.ID] || ""),
    nom: String(row[OP.NOM] || ""),
    type: String(row[OP.TYPE] || ""),
    dateDebut: formaterDate_(row[OP.DEBUT], "yyyy-MM-dd"),
    dateFin: formaterDate_(row[OP.FIN], "yyyy-MM-dd"),
    modeSaisie: String(row[OP.MODE] || ""),
    articlesPredefinis: String(row[OP.ARTICLES] || ""),
  };

  // 2. Chercher les réservations
  const reservations = lignes_(FEUILLE_RESERVATIONS)
    .filter(function (r) {
      return String(r[RES.OP]).trim() === cible;
    })
    .map(function (r) {
      return {
        idRes: String(r[RES.ID] || "").trim(),
        nom: String(r[RES.NOM] || ""),
        prenom: String(r[RES.PRENOM] || ""),
        contact: formaterContact_(r[RES.CONTACT]),
        etat: String(r[RES.ETAT] || ""),
        dateSaisie: formaterDate_(r[RES.DATE], "dd/MM/yyyy HH:mm"),
        articles: [],
      };
    });

  // 3. Rattacher les articles à chaque réservation
  if (reservations.length > 0) {
    const parId = {};
    reservations.forEach(function (res) {
      parId[res.idRes] = res;
    });
    lignes_(FEUILLE_ARTICLES).forEach(function (r) {
      const res = parId[String(r[ART.RES]).trim()];
      const nomArt = String(r[ART.NOM] || "").trim();
      if (res && nomArt) res.articles.push({ nom: nomArt, quantite: parseInt(r[ART.QTE], 10) || 0 });
    });
  }

  return { operation: opData, reservations: reservations };
}

// --- CRÉER UNE NOUVELLE OFFRE ---
function saveOperation(data) {
  verifierOffre_(data);

  return avecVerrou_(function () {
    const newId = nouvelId_("OP");
    feuille_(FEUILLE_OPERATIONS).appendRow([
      newId,
      texte_(data.nom),
      data.type,
      data.dateDebut,
      data.dateFin,
      data.modeSaisie,
      texte_(data.articlesPredefinis),
    ]);
    return true;
  });
}

// --- METTRE À JOUR UNE OPÉRATION ---
function updateOperation(data) {
  verifierOffre_(data);

  return avecVerrou_(function () {
    const feuille = feuille_(FEUILLE_OPERATIONS);
    const dataOps = feuille.getDataRange().getValues();

    for (let i = 1; i < dataOps.length; i++) {
      if (String(dataOps[i][OP.ID]).trim() === String(data.id).trim()) {
        // Colonnes B à G (Nom … Articles prédéfinis) de cette ligne
        feuille
          .getRange(i + 1, OP.NOM + 1, 1, 6)
          .setValues([
            [
              texte_(data.nom),
              data.type,
              data.dateDebut,
              data.dateFin,
              data.modeSaisie,
              texte_(data.articlesPredefinis),
            ],
          ]);
        return true;
      }
    }
    throw new Error("Impossible de trouver l'opération pour la mettre à jour.");
  });
}

// --- SUPPRIMER UNE OPÉRATION ET TOUTES SES RÉSERVATIONS (suppression en cascade) ---
function deleteOperation(idOp) {
  return avecVerrou_(function () {
    const cible = String(idOp).trim();

    // 1. Supprimer l'opération
    const sheetOps = feuille_(FEUILLE_OPERATIONS);
    const dataOps = sheetOps.getDataRange().getValues();
    let operationTrouvee = false;
    for (let i = dataOps.length - 1; i > 0; i--) {
      if (String(dataOps[i][OP.ID]).trim() === cible) {
        sheetOps.deleteRow(i + 1);
        operationTrouvee = true;
        break;
      }
    }
    if (!operationTrouvee) {
      throw new Error("L'ID '" + idOp + "' est introuvable dans l'onglet Operations.");
    }

    // 2. Supprimer les réservations liées (en partant du bas pour ne pas décaler les index)
    const sheetRes = feuille_(FEUILLE_RESERVATIONS);
    const dataRes = sheetRes.getDataRange().getValues();
    const idsReservations = {};
    for (let i = dataRes.length - 1; i > 0; i--) {
      if (String(dataRes[i][RES.OP]).trim() === cible) {
        idsReservations[String(dataRes[i][RES.ID]).trim()] = true;
        sheetRes.deleteRow(i + 1);
      }
    }

    // 3. Supprimer les articles de ces réservations
    if (Object.keys(idsReservations).length > 0) {
      const sheetArt = feuille_(FEUILLE_ARTICLES);
      const dataArt = sheetArt.getDataRange().getValues();
      for (let i = dataArt.length - 1; i > 0; i--) {
        if (idsReservations[String(dataArt[i][ART.RES]).trim()]) sheetArt.deleteRow(i + 1);
      }
    }

    return true;
  });
}
