// Réservations (onglets « Reservations » et « Articles ») : enregistrement et état.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Reservations_() {
  return "2026.10.14-1959";
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

  return avecVerrou_(function () {
    if (!operationExiste_(data.operationId)) {
      throw new Error("Cette offre n'existe plus. Rechargez la page.");
    }

    const idRes = nouvelId_("RES");
    const dateSaisie = Utilities.formatDate(new Date(), fuseau_(), "dd/MM/yyyy HH:mm");

    let contact = String(data.telephone || "").trim();
    const email = String(data.email || "").trim();
    if (email) contact += (contact ? " / " : "") + email;

    feuille_(FEUILLE_RESERVATIONS).appendRow([
      idRes,
      data.operationId,
      texte_(data.nom),
      texte_(data.prenom),
      texte_(contact),
      "Réservé",
      dateSaisie,
    ]);

    const sheetArt = feuille_(FEUILLE_ARTICLES);
    (data.articles || []).forEach(function (art) {
      const qte = parseInt(art.quantite, 10);
      if (!String(art.nom || "").trim() || !(qte > 0)) return;
      const idArt = "ART-" + Utilities.getUuid().substring(0, 8);
      sheetArt.appendRow([idArt, idRes, texte_(art.nom), qte]);
    });

    return true;
  });
}

// --- METTRE À JOUR LE STATUT D'UNE RÉSERVATION ---
function updateReservationStatus(idRes, newStatus) {
  if (ETATS_VALIDES.indexOf(newStatus) === -1) throw new Error("État inconnu : " + newStatus);

  return avecVerrou_(function () {
    const feuille = feuille_(FEUILLE_RESERVATIONS);
    const data = feuille.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][RES.ID]).trim() === String(idRes).trim()) {
        feuille.getRange(i + 1, RES.ETAT + 1).setValue(newStatus);
        return true;
      }
    }
    throw new Error("Réservation introuvable pour la mise à jour.");
  });
}
