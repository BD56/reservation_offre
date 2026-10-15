// Copie locale de la page : toutes les offres + les réservations des offres ACTIVES
// (date de fin non passée, ou sans date). Glissée dans la page par doGet (affichage
// immédiat), rechargée au retour sur la fenêtre et toutes les 2 minutes, renvoyée après
// chaque modification d'offre. Les offres terminées sont chargées à la demande.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Copie_() {
  return "2026.10.15-1102";
}

// Lignes d'un onglet sans l'en-tête ; onglet absent -> aucune ligne
function lignesSiPresent_(nomFeuille) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomFeuille);
  return feuille ? feuille.getDataRange().getValues().slice(1) : [];
}

function versOperation_(row) {
  return {
    id: String(row[OP.ID]).trim(),
    nom: String(row[OP.NOM] || ""),
    type: String(row[OP.TYPE] || ""),
    dateDebut: formaterDate_(row[OP.DEBUT], "yyyy-MM-dd"),
    dateFin: formaterDate_(row[OP.FIN], "yyyy-MM-dd"),
    modeSaisie: String(row[OP.MODE] || "") || (String(row[OP.TYPE]) === "Produit" ? "Libre" : ""),
    articlesPredefinis: String(row[OP.ARTICLES] || ""),
  };
}

function versReservation_(row) {
  return {
    idRes: String(row[RES.ID] || "").trim(),
    idOp: String(row[RES.OP] || "").trim(),
    nom: String(row[RES.NOM] || ""),
    prenom: String(row[RES.PRENOM] || ""),
    contact: formaterContact_(row[RES.CONTACT]),
    etat: String(row[RES.ETAT] || ""),
    dateSaisie: formaterDate_(row[RES.DATE], "dd/MM/yyyy HH:mm"),
    articles: [],
  };
}

// Réservations (avec leurs articles) des offres demandées : { idOp: [réservations] }.
// lignesRes : lignes de « Reservations » déjà lues (sinon lues ici).
function reservationsDesOffres_(idsOffres, lignesRes) {
  const parOffre = {};
  idsOffres.forEach(function (id) {
    parOffre[id] = [];
  });
  const parId = {};
  (lignesRes || lignesSiPresent_(FEUILLE_RESERVATIONS)).forEach(function (row) {
    const liste = parOffre[String(row[RES.OP]).trim()];
    if (!liste) return;
    const res = versReservation_(row);
    liste.push(res);
    parId[res.idRes] = res;
  });
  if (Object.keys(parId).length) {
    lignesSiPresent_(FEUILLE_ARTICLES).forEach(function (row) {
      const res = parId[String(row[ART.RES]).trim()];
      const nomArt = String(row[ART.NOM] || "").trim();
      if (res && nomArt) res.articles.push({ nom: nomArt, quantite: parseInt(row[ART.QTE], 10) || 0 });
    });
  }
  return parOffre;
}

function copie_() {
  const aujourdhui = Utilities.formatDate(new Date(), fuseau_(), "yyyy-MM-dd");
  // Nombre de réservations non annulées de chaque offre (offres terminées comprises)
  const compte = {};
  const lignesRes = lignesSiPresent_(FEUILLE_RESERVATIONS);
  lignesRes.forEach(function (row) {
    const idOp = String(row[RES.OP]).trim();
    if (idOp && row[RES.ETAT] !== ETAT_ANNULE) compte[idOp] = (compte[idOp] || 0) + 1;
  });
  const operations = lignesSiPresent_(FEUILLE_OPERATIONS)
    .map(versOperation_)
    .filter(function (op) {
      return op.id !== "";
    });
  operations.forEach(function (op) {
    op.count = compte[op.id] || 0;
    // Date de fin illisible (texte tapé à la main) : considérée comme active
    op.active = !/^\d{4}-\d{2}-\d{2}$/.test(op.dateFin) || op.dateFin >= aujourdhui;
  });
  const actives = operations
    .filter(function (op) {
      return op.active;
    })
    .map(function (op) {
      return op.id;
    });
  return { operations: operations, reservations: reservationsDesOffres_(actives, lignesRes) };
}

// Appelée par la page (rechargement de la copie)
function chargerCopie() {
  return copie_();
}

// Pour doGet : une erreur de lecture n'empêche jamais la page de s'ouvrir (elle
// rechargera la copie elle-même).
function copieSure_() {
  try {
    return copie_();
  } catch (e) {
    Logger.log("Copie initiale impossible : " + e);
    return null;
  }
}

// Valeur glissée dans un <script> de la page : JSON sans « < » (pas de </script>
// possible) ni séparateurs de ligne Unicode.
function jsonPourPage_(valeur) {
  return JSON.stringify(valeur)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
