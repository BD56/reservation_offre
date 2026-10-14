// Réservations (onglets « Reservations » et « Articles ») : enregistrement et état.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Reservations_() {
  return "2026.10.14-2030";
}

// --- SAUVEGARDER UNE NOUVELLE RÉSERVATION ---
// La page l'affiche tout de suite et l'envoie en arrière-plan avec son propre identifiant
// (data.idRes) : renvoyée après une réponse perdue, elle n'est pas écrite deux fois.
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
    const sheetRes = feuille_(FEUILLE_RESERVATIONS);
    const idRes = FORMAT_ID_RES.test(String(data.idRes || "")) ? data.idRes : nouvelId_("RES");
    const dejaEcrite = sheetRes
      .getDataRange()
      .getValues()
      .some(function (row) {
        return String(row[RES.ID]).trim() === idRes;
      });
    if (dejaEcrite) return { idRes: idRes, dejaEnregistree: true };

    const dateSaisie = Utilities.formatDate(new Date(), fuseau_(), "dd/MM/yyyy HH:mm");
    let contact = String(data.telephone || "").trim();
    const email = String(data.email || "").trim();
    if (email) contact += (contact ? " / " : "") + email;

    sheetRes.appendRow([
      idRes,
      data.operationId,
      texte_(data.nom),
      texte_(data.prenom),
      texte_(contact),
      "Réservé",
      dateSaisie,
    ]);

    // Articles écrits en une fois
    const articles = (data.articles || [])
      .filter(function (art) {
        return String(art.nom || "").trim() && parseInt(art.quantite, 10) > 0;
      })
      .map(function (art) {
        return [
          "ART-" + Utilities.getUuid().substring(0, 8),
          idRes,
          texte_(art.nom),
          parseInt(art.quantite, 10),
        ];
      });
    if (articles.length) {
      const sheetArt = feuille_(FEUILLE_ARTICLES);
      sheetArt.getRange(sheetArt.getLastRow() + 1, 1, articles.length, 4).setValues(articles);
    }
    return { idRes: idRes, dateSaisie: dateSaisie };
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
