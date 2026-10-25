// Arrivages par lot : quantité reçue par article (onglet « Arrivages »), répartie entre les
// clients de la plus ancienne réservation à la plus récente ; quantité remise au client
// (retrait partiel permis). Règle : reçu = attribué aux clients + en stock.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Arrivages_() {
  return "2026.10.25-1128";
}

// Ligne d'article telle que l'application la lit. Arrivé / Remis vides = ligne d'avant le
// suivi des arrivages : rien d'arrivé, sauf une réservation déjà « Retrait » (tout remis,
// sans entamer le stock reçu : `suivi` faux).
function ligneArticle_(row, etatRes) {
  const q = parseInt(row[ART.QTE], 10) || 0;
  const brut = row[ART.ARR];
  if (brut === "" || brut === null || brut === undefined) {
    const fini = etatRes === ETAT_RETIRE;
    return { q: q, arr: fini ? q : 0, rem: fini ? q : 0, suivi: false };
  }
  const arr = Math.min(q, Math.max(0, parseInt(brut, 10) || 0));
  const rem = Math.min(arr, Math.max(0, parseInt(row[ART.REM], 10) || 0));
  return { q: q, arr: arr, rem: rem, suivi: true };
}

// Quantités reçues : { idOp: { article: total } }
function recusParOffre_() {
  const recus = {};
  lignesSiPresent_(FEUILLE_ARRIVAGES).forEach(function (row) {
    const idOp = String(row[ARV.OP]).trim();
    const art = String(row[ARV.ART] || "").trim();
    const q = parseInt(row[ARV.QTE], 10) || 0;
    if (!idOp || !art || !q) return;
    recus[idOp] = recus[idOp] || {};
    recus[idOp][art] = (recus[idOp][art] || 0) + q;
  });
  return recus;
}

// Arrivé / Remis réécrits en une fois (colonnes E:F), lignes non modifiées comprises
function ecrireArriveRemis_(feuille, valeurs) {
  if (valeurs.length < 2) return;
  feuille.getRange(2, ART.ARR + 1, valeurs.length - 1, 2).setValues(
    valeurs.slice(1).map(function (r) {
      return [r[ART.ARR] === undefined ? "" : r[ART.ARR], r[ART.REM] === undefined ? "" : r[ART.REM]];
    })
  );
}

// États des réservations d'une offre, dans l'ordre des lignes (= ordre de saisie)
function etatsReservations_(idOp) {
  const etats = {};
  lignes_(FEUILLE_RESERVATIONS).forEach(function (r) {
    if (String(r[RES.OP]).trim() === idOp) etats[String(r[RES.ID]).trim()] = String(r[RES.ETAT] || "");
  });
  return etats;
}

// Répartit le stock d'un article (reçu − attribué) : la plus ancienne réservation d'abord,
// chacune reçoit ce qui est disponible (même en partie) ; rien n'est repris à personne.
// À appeler sous verrou. Renvoie { servis: nombre de clients servis, reste: stock restant }.
function repartir_(idOp, nom) {
  const recu = (recusParOffre_()[idOp] || {})[nom] || 0;
  const etats = etatsReservations_(idOp);
  const feuille = feuille_(FEUILLE_ARTICLES);
  const valeurs = feuille.getDataRange().getValues();
  let attribue = 0;
  const parRes = {};
  for (let i = 1; i < valeurs.length; i++) {
    const idRes = String(valeurs[i][ART.RES]).trim();
    if (!(idRes in etats) || etats[idRes] === ETAT_ANNULE) continue;
    if (String(valeurs[i][ART.NOM] || "").trim() !== nom) continue;
    const l = ligneArticle_(valeurs[i], etats[idRes]);
    if (l.suivi) attribue += l.arr;
    (parRes[idRes] = parRes[idRes] || []).push({ i: i, l: l });
  }
  let stock = recu - attribue;
  const servis = {};
  Object.keys(etats).forEach(function (idRes) {
    (parRes[idRes] || []).forEach(function (x) {
      if (stock <= 0 || (!x.l.suivi && etats[idRes] === ETAT_RETIRE)) return;
      const manque = x.l.q - x.l.arr;
      if (manque <= 0) return;
      const donne = Math.min(manque, stock);
      valeurs[x.i][ART.ARR] = x.l.arr + donne;
      valeurs[x.i][ART.REM] = x.l.rem;
      stock -= donne;
      servis[idRes] = true;
    });
  });
  if (Object.keys(servis).length) ecrireArriveRemis_(feuille, valeurs);
  return { servis: Object.keys(servis).length, reste: Math.max(0, stock) };
}

// --- ENREGISTRER UN ARRIVAGE --- quantité reçue d'un article, répartie aussitôt.
// quantite = 0 : redistribue seulement le stock (ex. après une correction dans une fiche).
// Renvoie { servis, reste, copie }.
function enregistrerArrivage(idOp, article, quantite) {
  const cible = String(idOp || "").trim();
  const nom = String(article || "").trim();
  const n = quantite === "" || quantite === null || quantite === undefined ? 0 : Number(quantite);
  if (!nom) throw new Error("Article manquant.");
  if (!(Math.floor(n) === n && n >= 0 && n <= 100000))
    throw new Error("Quantité reçue : un nombre entier (ex. 6).");

  let bilan;
  avecVerrou_(function () {
    const op = lignes_(FEUILLE_OPERATIONS).find(function (r) {
      return String(r[OP.ID]).trim() === cible;
    });
    if (!op) throw new Error("Cette offre n'existe plus. Rechargez la page.");
    if (String(op[OP.TYPE]) !== "Produit")
      throw new Error("Les arrivages concernent les offres de produits.");
    if (n > 0) {
      feuille_(FEUILLE_ARRIVAGES).appendRow([
        Utilities.formatDate(new Date(), fuseau_(), "dd/MM/yyyy HH:mm"),
        cible,
        texte_(nom),
        n,
      ]);
    }
    bilan = repartir_(cible, nom);
  });
  bilan.copie = copie_();
  return bilan;
}

// --- REMETTRE AU CLIENT --- remis = { idArticle: quantité remise } (au plus l'arrivé).
// « Retiré » envoie remis = arrivé pour chaque article ; « Annuler » renvoie les anciennes
// valeurs. État calculé : « Retrait » quand tout est remis. Renvoie { etat }.
function remettre(idRes, remis) {
  const cible = String(idRes || "").trim();
  let etat;
  avecVerrou_(function () {
    const fRes = feuille_(FEUILLE_RESERVATIONS);
    const vRes = fRes.getDataRange().getValues();
    let ligne = -1;
    for (let i = 1; i < vRes.length; i++) {
      if (String(vRes[i][RES.ID]).trim() === cible) {
        ligne = i;
        break;
      }
    }
    if (ligne < 0) throw new Error("Réservation introuvable (supprimée depuis un autre poste ?).");
    const etatAvant = String(vRes[ligne][RES.ETAT] || "");
    if (etatAvant === ETAT_ANNULE) throw new Error("Réservation annulée : rien à remettre.");

    const fArt = feuille_(FEUILLE_ARTICLES);
    const vArt = fArt.getDataRange().getValues();
    let complet = true;
    let modif = false;
    for (let i = 1; i < vArt.length; i++) {
      if (String(vArt[i][ART.RES]).trim() !== cible) continue;
      const l = ligneArticle_(vArt[i], etatAvant);
      const id = String(vArt[i][ART.ID]).trim();
      let rem = l.rem;
      if (remis && Object.prototype.hasOwnProperty.call(remis, id)) {
        const v = parseInt(remis[id], 10);
        if (!(v >= 0)) throw new Error("Quantité remise invalide.");
        rem = Math.min(l.arr, v);
        if (l.suivi || rem !== l.rem) {
          vArt[i][ART.ARR] = l.arr;
          vArt[i][ART.REM] = rem;
          modif = true;
        }
      }
      if (rem < l.q) complet = false;
    }
    if (modif) ecrireArriveRemis_(fArt, vArt);
    etat = complet ? ETAT_RETIRE : etatAvant === ETAT_RETIRE ? "Réservé" : etatAvant;
    if (etat !== etatAvant) fRes.getRange(ligne + 1, RES.ETAT + 1).setValue(etat);
  });
  return { etat: etat };
}

// Réservation annulée : ce qui lui était attribué et pas encore remis retourne en stock.
// À appeler sous verrou.
function libererAnnulee_(idRes) {
  const cible = String(idRes).trim();
  const fArt = feuille_(FEUILLE_ARTICLES);
  const vArt = fArt.getDataRange().getValues();
  let modif = false;
  for (let i = 1; i < vArt.length; i++) {
    if (String(vArt[i][ART.RES]).trim() !== cible) continue;
    const l = ligneArticle_(vArt[i], "");
    if (l.suivi && l.arr > l.rem) {
      vArt[i][ART.ARR] = l.rem;
      modif = true;
    }
  }
  if (modif) ecrireArriveRemis_(fArt, vArt);
}
