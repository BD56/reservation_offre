// Offres (onglet « Operations ») : détail, création, modification, suppression.
// La liste des offres est dans la copie de la page (Copie.gs).

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Operations_() {
  return "2026.10.15-1339";
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

// --- DÉTAIL D'UNE OFFRE (offres terminées : les actives sont déjà dans la copie) ---
function getOperationDetails(idOp) {
  const cible = String(idOp).trim();
  const row = lignes_(FEUILLE_OPERATIONS).find(function (r) {
    return String(r[OP.ID]).trim() === cible;
  });
  if (!row) throw new Error("Opération introuvable.");
  return { operation: versOperation_(row), reservations: reservationsDesOffres_([cible])[cible] };
}

// --- CRÉER UNE NOUVELLE OFFRE --- (renvoie la copie à jour)
function saveOperation(data) {
  verifierOffre_(data);
  avecVerrou_(function () {
    feuille_(FEUILLE_OPERATIONS).appendRow([
      nouvelId_("OP"),
      texte_(data.nom),
      data.type,
      data.dateDebut,
      data.dateFin,
      data.modeSaisie,
      texte_(data.articlesPredefinis),
    ]);
  });
  return copie_();
}

// --- METTRE À JOUR UNE OPÉRATION --- (renvoie la copie à jour)
function updateOperation(data) {
  verifierOffre_(data);
  avecVerrou_(function () {
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
        return;
      }
    }
    throw new Error("Impossible de trouver l'opération pour la mettre à jour.");
  });
  return copie_();
}

// --- SUPPRIMER UNE OPÉRATION ET TOUTES SES RÉSERVATIONS --- (renvoie la copie à jour)
// Chaque onglet est réécrit en une fois (supprimer les lignes une à une prenait
// plusieurs secondes par centaine de lignes).
function deleteOperation(idOp) {
  const cible = String(idOp).trim();
  avecVerrou_(function () {
    const retirees = reecrire_(feuille_(FEUILLE_OPERATIONS), function (row) {
      return String(row[OP.ID]).trim() !== cible;
    });
    if (!retirees) throw new Error("L'ID '" + idOp + "' est introuvable dans l'onglet Operations.");

    const idsReservations = {};
    reecrire_(feuille_(FEUILLE_RESERVATIONS), function (row) {
      if (String(row[RES.OP]).trim() !== cible) return true;
      idsReservations[String(row[RES.ID]).trim()] = true;
      return false;
    });
    if (Object.keys(idsReservations).length) {
      reecrire_(feuille_(FEUILLE_ARTICLES), function (row) {
        return !idsReservations[String(row[ART.RES]).trim()];
      });
    }
  });
  return copie_();
}
