// Réservations (onglets « Reservations » et « Articles ») : enregistrement et état.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Reservations_() {
  return "2026.10.26-1833";
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
      // Arrivé / Remis à 0 : la ligne est suivie dans les arrivages dès sa création
      return [
        "ART-" + Utilities.getUuid().substring(0, 8),
        idRes,
        texte_(art.nom),
        parseInt(art.quantite, 10),
        0,
        0,
      ];
    });
}

function ecrireArticles_(lignes) {
  if (!lignes.length) return;
  const sheetArt = feuille_(FEUILLE_ARTICLES);
  sheetArt.getRange(sheetArt.getLastRow() + 1, 1, lignes.length, lignes[0].length).setValues(lignes);
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
        if (newStatus === ETAT_ANNULE) libererAnnulee_(idRes); // retour en stock
        return true;
      }
    }
    throw new Error("Réservation introuvable pour la mise à jour.");
  });
}

// --- MODIFIER UNE RÉSERVATION (client, articles, état ; arrivé / remis par article) ---
// Offre de produits : l'état « Retrait » est calculé (tout remis) ; on ne peut donner à un
// client que ce qui est en stock (reçu − attribué), sauf à ne rien attribuer de plus
// qu'avant. Annulée : ce qui n'est pas remis retourne en stock. Renvoie la copie à jour.
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
    const etatAvant = String(valeurs[ligne][RES.ETAT] || "");
    const offre = lignes_(FEUILLE_OPERATIONS).find(function (row) {
      return String(row[OP.ID]).trim() === idOp;
    });
    const produits = !!offre && String(offre[OP.TYPE]) === "Produit";
    const annulee = data.etat === ETAT_ANNULE;

    // Lignes d'articles du classeur (celles de cette réservation, et des autres de l'offre)
    const fArt = feuille_(FEUILLE_ARTICLES);
    const lignesArt = fArt.getDataRange().getValues().slice(1);
    const anciennes = {};
    lignesArt.forEach(function (row) {
      if (String(row[ART.RES]).trim() === cible)
        anciennes[String(row[ART.NOM] || "").trim()] = ligneArticle_(row, etatAvant);
    });

    const nouvelles = (data.articles || [])
      .filter(function (art) {
        return String(art.nom || "").trim() && parseInt(art.quantite, 10) > 0;
      })
      .map(function (art) {
        const nom = String(art.nom).trim();
        const q = parseInt(art.quantite, 10);
        const avant = anciennes[nom];
        let arr = art.arrive === undefined ? (avant ? avant.arr : 0) : parseInt(art.arrive, 10) || 0;
        let rem = art.remis === undefined ? (avant ? avant.rem : 0) : parseInt(art.remis, 10) || 0;
        arr = Math.min(q, Math.max(0, arr));
        rem = Math.min(arr, Math.max(0, rem));
        if (annulee) arr = rem;
        // Ligne d'avant le suivi, inchangée : reste hors suivi (ne touche pas au stock)
        const horsSuivi = !!avant && !avant.suivi && avant.q === q && avant.arr === arr && avant.rem === rem;
        return { nom: nom, q: q, arr: arr, rem: rem, horsSuivi: horsSuivi };
      });
    if (produits && !nouvelles.length) {
      throw new Error(
        "Une réservation de produits garde au moins un article (sinon, passez-la en « Annulé »)."
      );
    }

    // Stock : rien de plus que ce qui est reçu (ou, à défaut, pas plus qu'avant)
    if (produits && !annulee) {
      const recus = recusParOffre_()[idOp] || {};
      const etats = etatsReservations_(idOp);
      nouvelles.forEach(function (n) {
        let autres = 0;
        lignesArt.forEach(function (row) {
          const idRes = String(row[ART.RES]).trim();
          if (idRes === cible || !(idRes in etats) || etats[idRes] === ETAT_ANNULE) return;
          if (String(row[ART.NOM] || "").trim() !== n.nom) return;
          const l = ligneArticle_(row, etats[idRes]);
          if (l.suivi) autres += l.arr;
        });
        const avant = anciennes[n.nom];
        const avantSuivi = avant && avant.suivi && etatAvant !== ETAT_ANNULE ? avant.arr : 0;
        const apres = n.horsSuivi ? 0 : n.arr;
        const recu = recus[n.nom] || 0;
        if (apres > avantSuivi && autres + apres > recu) {
          const dispo = Math.max(0, recu - autres - avantSuivi);
          throw new Error(
            "Plus assez de « " +
              n.nom +
              " » en stock : " +
              dispo +
              " disponible" +
              (dispo > 1 ? "s" : "") +
              "."
          );
        }
      });
    }

    // État : pour des produits, « Retrait » = tout remis (calculé)
    let etat = data.etat;
    if (produits && !annulee) {
      const toutRemis = nouvelles.every(function (n) {
        return n.rem >= n.q;
      });
      etat = toutRemis ? ETAT_RETIRE : etat === ETAT_RETIRE ? "Réservé" : etat;
    }

    // Colonnes Nom, Prénom, Contact, État
    feuille
      .getRange(ligne + 1, RES.NOM + 1, 1, 4)
      .setValues([[texte_(data.nom), texte_(data.prenom), texte_(contactDe_(data)), etat]]);
    // Articles : les anciens retirés, les nouveaux ajoutés
    reecrire_(fArt, function (row) {
      return String(row[ART.RES]).trim() !== cible;
    });
    ecrireArticles_(
      nouvelles.map(function (n) {
        return [
          "ART-" + Utilities.getUuid().substring(0, 8),
          cible,
          texte_(n.nom),
          n.q,
          n.horsSuivi ? "" : n.arr,
          n.horsSuivi ? "" : n.rem,
        ];
      })
    );
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
