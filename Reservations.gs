// Réservations (onglets « Reservations » et « Articles ») : enregistrement et état.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Reservations_() {
  return "2026.10.15-1052";
}

function verifierClient_(data) {
  if (!String(data.nom || "").trim() || !String(data.prenom || "").trim()) {
    throw new Error("Le nom et le prénom sont obligatoires.");
  }
  if (!String(data.telephone || "").trim() && !String(data.email || "").trim()) {
    throw new Error("Un téléphone ou un email est obligatoire.");
  }
}

function contactDe_(data) {
  let contact = String(data.telephone || "").trim();
  const email = String(data.email || "").trim();
  if (email) contact += (contact ? " / " : "") + email;
  return contact;
}

// Lignes d'articles prêtes à écrire (nom vide ou quantité nulle : ignorés)
function lignesArticles_(idRes, articles) {
  return (articles || [])
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
}

function ecrireArticles_(lignes) {
  if (!lignes.length) return;
  const sheetArt = feuille_(FEUILLE_ARTICLES);
  sheetArt.getRange(sheetArt.getLastRow() + 1, 1, lignes.length, 4).setValues(lignes);
}

// --- SAUVEGARDER UNE NOUVELLE RÉSERVATION ---
// La page l'affiche tout de suite et l'envoie en arrière-plan avec son propre identifiant
// (data.idRes) : renvoyée après une réponse perdue, elle n'est pas écrite deux fois.
function saveReservation(data) {
  if (!data || !data.operationId) throw new Error("Aucune offre sélectionnée.");
  verifierClient_(data);

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
    sheetRes.appendRow([
      idRes,
      data.operationId,
      texte_(data.nom),
      texte_(data.prenom),
      texte_(contactDe_(data)),
      "Réservé",
      dateSaisie,
    ]);
    ecrireArticles_(lignesArticles_(idRes, data.articles)); // en une fois
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

// --- MODIFIER UNE RÉSERVATION (client, articles, état) --- (renvoie la copie à jour)
function updateReservation(data) {
  if (!data || !data.idRes) throw new Error("Réservation inconnue.");
  verifierClient_(data);
  if (ETATS_VALIDES.indexOf(data.etat) === -1) throw new Error("État inconnu : " + data.etat);

  avecVerrou_(function () {
    const feuille = feuille_(FEUILLE_RESERVATIONS);
    const valeurs = feuille.getDataRange().getValues();
    const cible = String(data.idRes).trim();
    let ligne = -1;
    for (let i = 1; i < valeurs.length; i++) {
      if (String(valeurs[i][RES.ID]).trim() === cible) {
        ligne = i;
        break;
      }
    }
    if (ligne < 0) throw new Error("Réservation introuvable (supprimée depuis un autre poste ?).");

    const idOp = String(valeurs[ligne][RES.OP]).trim();
    const offre = lignes_(FEUILLE_OPERATIONS).find(function (row) {
      return String(row[OP.ID]).trim() === idOp;
    });
    const nouveaux = lignesArticles_(cible, data.articles);
    if (offre && offre[OP.TYPE] === "Produit" && !nouveaux.length) {
      throw new Error(
        "Une réservation de produits garde au moins un article (sinon, passez-la en « Annulé »)."
      );
    }

    // Colonnes Nom, Prénom, Contact, État
    feuille
      .getRange(ligne + 1, RES.NOM + 1, 1, 4)
      .setValues([[texte_(data.nom), texte_(data.prenom), texte_(contactDe_(data)), data.etat]]);
    // Articles : les anciens retirés, les nouveaux ajoutés
    reecrire_(feuille_(FEUILLE_ARTICLES), function (row) {
      return String(row[ART.RES]).trim() !== cible;
    });
    ecrireArticles_(nouveaux);
  });
  return copie_();
}

// --- SUPPRIMER UNE RÉSERVATION ET SES ARTICLES --- (renvoie la copie à jour)
function deleteReservation(idRes) {
  const cible = String(idRes || "").trim();
  avecVerrou_(function () {
    const retirees = reecrire_(feuille_(FEUILLE_RESERVATIONS), function (row) {
      return String(row[RES.ID]).trim() !== cible;
    });
    if (!retirees) throw new Error("Réservation introuvable (déjà supprimée ?).");
    reecrire_(feuille_(FEUILLE_ARTICLES), function (row) {
      return String(row[ART.RES]).trim() !== cible;
    });
  });
  return copie_();
}
