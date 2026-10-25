// Arrivages côté serveur : lot réparti de la plus ancienne réservation à la plus récente
// (même en partie), annulées exclues, stock (reçu = attribué + en stock), remise au client
// (retrait partiel, état « Retrait » calculé, annulation), corrections dans la fiche,
// anciennes réservations d'avant le suivi, suppression de l'offre.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
const repo = process.argv[2];
const J = (x) => JSON.parse(JSON.stringify(x));
try {
  const env = makeEnv({ repo });
  const c = env.ctx;
  c.saveOperation({
    nom: "Plateaux",
    type: "Produit",
    modeSaisie: "Predefini",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "Océan, Prestige",
  });
  const idOp = lignes(env, "Operations")[0][0];
  const resa = (nom, articles) =>
    c.saveReservation({ operationId: idOp, nom, prenom: "x", telephone: "0600000000", email: "", articles })
      .idRes;
  const a = resa("A", [{ nom: "Océan", quantite: 2 }]);
  const b = resa("B", [
    { nom: "Océan", quantite: 1 },
    { nom: "Prestige", quantite: 1 },
  ]);
  const annulee = resa("ANNULEE", [{ nom: "Océan", quantite: 5 }]);
  c.updateReservationStatus(annulee, "Annulé");
  const d = resa("D", [{ nom: "Océan", quantite: 3 }]);
  const art = (idRes, nom) => lignes(env, "Articles").find((x) => x[1] === idRes && x[2] === nom);
  const resDe = (copie, idRes) => copie.reservations[idOp].find((r) => r.idRes === idRes);
  const etat = (idRes) => lignes(env, "Reservations").find((r) => r[0] === idRes)[5];
  assert.deepStrictEqual(art(a, "Océan").slice(3), [2, 0, 0], "nouvelle ligne suivie : arrivé 0, remis 0");

  // --- Lot de 4 Océan : A (2), B (1), D reçoit 1 sur 3 ; l'annulée rien ---
  let r = J(c.enregistrerArrivage(idOp, "Océan", 4));
  assert.deepStrictEqual([r.servis, r.reste], [3, 0]);
  assert.strictEqual(art(a, "Océan")[4], 2);
  assert.strictEqual(art(b, "Océan")[4], 1);
  assert.strictEqual(art(d, "Océan")[4], 1, "servi en partie");
  assert.strictEqual(art(annulee, "Océan")[4], 0, "annulée : rien");
  assert.strictEqual(lignes(env, "Arrivages").length, 1);
  assert.deepStrictEqual(lignes(env, "Arrivages")[0].slice(1), [idOp, "Océan", 4]);
  assert.ok(lignes(env, "Arrivages")[0][0] instanceof Date, "date de l'arrivage");
  assert.deepStrictEqual(r.copie.operations[0].recus, { Océan: 4 });
  assert.deepStrictEqual(
    (({ arrive, remis, suivi }) => ({ arrive, remis, suivi }))(resDe(r.copie, d).articles[0]),
    { arrive: 1, remis: 0, suivi: true }
  );
  // Lot de 5 : D complété (2), 3 en stock ; rien n'est repris à personne
  r = J(c.enregistrerArrivage(idOp, "Océan", 5));
  assert.deepStrictEqual([r.servis, r.reste], [1, 3]);
  assert.strictEqual(art(d, "Océan")[4], 3);
  // Contrôles
  assert.throws(() => c.enregistrerArrivage(idOp, "Océan", -1), /nombre entier/);
  assert.throws(() => c.enregistrerArrivage(idOp, "Océan", 1.5), /nombre entier/);
  assert.throws(() => c.enregistrerArrivage(idOp, "", 2), /Article manquant/);
  assert.throws(() => c.enregistrerArrivage("OP-INCONNUE", "Océan", 2), /n'existe plus/);
  assert.strictEqual(lignes(env, "Arrivages").length, 2, "rien d'enregistré après un refus");
  assert.strictEqual(env.verrous, 0);

  // --- Remise au client (retrait partiel) ---
  const idArtB = (nom) => art(b, nom)[0];
  assert.deepStrictEqual(
    J(c.remettre(b, { [idArtB("Océan")]: 1 })),
    { etat: "Réservé" },
    "Prestige pas arrivé"
  );
  assert.strictEqual(art(b, "Océan")[5], 1);
  assert.deepStrictEqual(
    J(c.remettre(b, { [idArtB("Prestige")]: 3 })),
    { etat: "Réservé" },
    "remis ≤ arrivé (0)"
  );
  assert.strictEqual(art(b, "Prestige")[5], 0);
  c.enregistrerArrivage(idOp, "Prestige", 1);
  assert.deepStrictEqual(
    J(c.remettre(b, { [idArtB("Prestige")]: 1 })),
    { etat: "Retrait" },
    "tout remis → Retrait"
  );
  assert.strictEqual(etat(b), "Retrait");
  assert.deepStrictEqual(
    J(c.remettre(b, { [idArtB("Prestige")]: 0 })),
    { etat: "Réservé" },
    "Annuler → Réservé"
  );
  assert.throws(() => c.remettre(annulee, {}), /annulée/);
  assert.throws(() => c.remettre("RES-INCONNUE", {}), /introuvable/);

  // --- Fiche : on ne donne que ce qui est en stock (3 Océan en stock) ---
  const fiche = (idRes, articles, etatFiche) =>
    J(
      c.updateReservation({
        idRes,
        nom: "D",
        prenom: "x",
        telephone: "0600000000",
        email: "",
        etat: etatFiche || "Réservé",
        articles,
      })
    );
  const e = resa("E", [{ nom: "Océan", quantite: 4 }]);
  assert.throws(
    () => fiche(e, [{ nom: "Océan", quantite: 4, arrive: 4, remis: 0 }]),
    /Plus assez de « Océan » en stock : 3 disponibles/
  );
  fiche(e, [{ nom: "Océan", quantite: 4, arrive: 3, remis: 1 }]);
  assert.deepStrictEqual(art(e, "Océan").slice(3), [4, 3, 1]);
  // Retirer à A : retourne en stock, puis « Répartir » sans quantité le redonne… à A (plus ancien)
  fiche(a, [{ nom: "Océan", quantite: 2, arrive: 0, remis: 0 }]);
  r = J(c.enregistrerArrivage(idOp, "Océan", 0));
  assert.deepStrictEqual([r.servis, r.reste], [1, 0]);
  assert.strictEqual(art(a, "Océan")[4], 2);
  assert.strictEqual(
    lignes(env, "Arrivages").length,
    3,
    "« Répartir » sans quantité : pas de nouvel arrivage"
  );
  // Tout remis dans la fiche → état Retrait calculé, même si la fiche envoie « Réservé »
  fiche(a, [{ nom: "Océan", quantite: 2, arrive: 2, remis: 2 }], "Réservé");
  assert.strictEqual(etat(a), "Retrait");
  // Annulée depuis la fiche : ce qui n'est pas remis retourne en stock
  fiche(e, [{ nom: "Océan", quantite: 4, arrive: 3, remis: 1 }], "Annulé");
  assert.deepStrictEqual(art(e, "Océan").slice(3), [4, 1, 1]);
  assert.strictEqual(etat(e), "Annulé");
  // Annulée par le changement d'état : idem
  c.updateReservationStatus(d, "Annulé");
  assert.strictEqual(art(d, "Océan")[4], 0, "D : 3 Océan rendus au stock");

  // --- Anciennes réservations (avant le suivi : Arrivé / Remis vides) ---
  env.sheets.Reservations.appendRow([
    "RES-VIEILLE-R",
    idOp,
    "'VIEUX",
    "'r",
    "'0611111111",
    "Retrait",
    "01/10/2026 10:00",
  ]);
  env.sheets.Articles.appendRow(["ART-V1", "RES-VIEILLE-R", "Océan", 2]);
  env.sheets.Reservations.appendRow([
    "RES-VIEILLE-A",
    idOp,
    "'ATTEND",
    "'a",
    "'0622222222",
    "Réservé",
    "01/10/2026 11:00",
  ]);
  env.sheets.Articles.appendRow(["ART-V2", "RES-VIEILLE-A", "Océan", 1]);
  const cp = J(c.chargerCopie());
  assert.deepStrictEqual(
    (({ arrive, remis, suivi }) => ({ arrive, remis, suivi }))(resDe(cp, "RES-VIEILLE-R").articles[0]),
    { arrive: 2, remis: 2, suivi: false },
    "ancienne « Retrait » : tout remis, hors stock"
  );
  assert.strictEqual(
    resDe(cp, "RES-VIEILLE-A").articles[0].arrive,
    0,
    "ancienne « Réservé » : rien d'arrivé"
  );
  // Le stock n'est pas entamé par l'ancienne « Retrait » ; l'ancienne « Réservé » est servie
  r = J(c.enregistrerArrivage(idOp, "Océan", 1));
  assert.strictEqual(art("RES-VIEILLE-A", "Océan")[4], 1, "ancienne réservation servie au prochain lot");
  assert.strictEqual(art("RES-VIEILLE-R", "Océan")[4], "", "ancienne « Retrait » : toujours hors suivi");
  // Modifier le téléphone d'une ancienne « Retrait » : rien ne bouge côté stock ni état
  c.updateReservation({
    idRes: "RES-VIEILLE-R",
    nom: "VIEUX",
    prenom: "r",
    telephone: "0699999999",
    email: "",
    etat: "Réservé",
    articles: [{ nom: "Océan", quantite: 2, arrive: 2, remis: 2 }],
  });
  assert.strictEqual(etat("RES-VIEILLE-R"), "Retrait");
  assert.deepStrictEqual(art("RES-VIEILLE-R", "Océan").slice(3), [2, "", ""], "reste hors suivi");

  // --- Suppression de l'offre : arrivages supprimés aussi ---
  c.saveOperation({
    nom: "Autre",
    type: "Produit",
    modeSaisie: "Libre",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  const idAutre = lignes(env, "Operations")[1][0];
  c.enregistrerArrivage(idAutre, "Truc", 2);
  c.deleteOperation(idOp);
  assert.deepStrictEqual(
    lignes(env, "Arrivages").map((x) => x[1]),
    [idAutre],
    "seuls les arrivages de l'offre supprimée partent"
  );
  // Évènement : pas d'arrivages
  c.saveOperation({
    nom: "Atelier",
    type: "Evenement",
    modeSaisie: "",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  assert.throws(() => c.enregistrerArrivage(lignes(env, "Operations")[1][0], "X", 1), /offres de produits/);
  assert.strictEqual(env.verrous, 0);
  console.log("test_arrivages : OK");
} catch (err) {
  console.log("test_arrivages : ÉCHEC " + ((err && err.stack) || err));
  process.exit(1);
}
