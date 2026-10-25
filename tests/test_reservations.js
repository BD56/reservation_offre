// Réservations côté serveur : contrôles, écriture en texte (0 du téléphone, formules),
// articles écrits en une fois, identifiant donné par la page (réessai sans double), offre
// supprimée entre-temps, changement d'état.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
const J = (x) => JSON.parse(JSON.stringify(x));
const repo = process.argv[2];
try {
  const env = makeEnv({ repo });
  const c = env.ctx;
  c.saveOperation({
    nom: "Foie gras",
    type: "Produit",
    modeSaisie: "Libre",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  const idOp = lignes(env, "Operations")[0][0];
  const resa = (o) =>
    Object.assign(
      {
        operationId: idOp,
        nom: "Dupont",
        prenom: "Jean",
        telephone: "0612345678",
        email: "",
        articles: [{ nom: "Bloc 200g", quantite: 2 }],
      },
      o
    );

  // --- Contrôles ---
  assert.throws(() => c.saveReservation(resa({ operationId: "" })), /Aucune offre/);
  assert.throws(() => c.saveReservation(resa({ nom: " " })), /nom et le prénom/);
  assert.throws(() => c.saveReservation(resa({ telephone: "", email: "" })), /téléphone ou un email/);
  assert.throws(() => c.saveReservation(resa({ operationId: "OP-SUPPRIMEE" })), /n'existe plus/);
  assert.strictEqual(lignes(env, "Reservations").length, 0, "rien d'écrit après un refus");
  assert.strictEqual(env.verrous, 0);

  // --- Enregistrement ---
  const rep = J(c.saveReservation(resa()));
  assert.match(rep.idRes, /^RES-\d+-[0-9a-f]{4}$/, "identifiant créé par le serveur si absent");
  assert.match(rep.dateSaisie, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  let r = lignes(env, "Reservations");
  assert.strictEqual(r.length, 1);
  assert.match(r[0][0], /^RES-\d+-[0-9a-f]{4}$/);
  assert.strictEqual(r[0][1], idOp);
  assert.strictEqual(r[0][4], "0612345678", "téléphone gardé en texte avec son 0");
  assert.strictEqual(r[0][5], "Réservé");
  assert.ok(r[0][6] instanceof Date, "date de saisie (convertie par Sheets)");
  let a = lignes(env, "Articles");
  assert.deepStrictEqual(
    a.map((x) => [x[1], x[2], x[3]]),
    [[r[0][0], "Bloc 200g", 2]]
  );

  // Téléphone + email, formule, articles invalides ignorés
  c.saveReservation(
    resa({
      nom: "=HYPERLINK(1)",
      prenom: "+33",
      telephone: "+33612345678",
      email: "a@b.fr",
      articles: [
        { nom: "Bloc", quantite: 0 },
        { nom: "", quantite: 3 },
        { nom: "L'entier", quantite: "3" },
      ],
    })
  );
  r = lignes(env, "Reservations");
  assert.strictEqual(r[1][2], "=HYPERLINK(1)", "formule neutralisée");
  assert.strictEqual(r[1][3], "+33");
  assert.strictEqual(r[1][4], "+33612345678 / a@b.fr");
  a = lignes(env, "Articles");
  assert.deepStrictEqual(
    a.slice(1).map((x) => [x[2], x[3]]),
    [["L'entier", 3]]
  );

  // Visible dans le détail
  const d = c.getOperationDetails(idOp);
  assert.strictEqual(d.reservations[0].contact, "0612345678");
  assert.strictEqual(d.reservations[1].nom, "=HYPERLINK(1)");

  // --- Identifiant donné par la page : un réessai n'écrit pas deux fois ---
  const idPage = "RES-1792000000000-ab12";
  const r1 = J(c.saveReservation(resa({ idRes: idPage, nom: "Réessai" })));
  assert.strictEqual(r1.idRes, idPage);
  const nbArticles = lignes(env, "Articles").length;
  const r2 = J(c.saveReservation(resa({ idRes: idPage, nom: "Réessai" })));
  assert.deepStrictEqual(r2, { idRes: idPage, dejaEnregistree: true });
  assert.strictEqual(lignes(env, "Reservations").filter((x) => x[0] === idPage).length, 1, "pas de double");
  assert.strictEqual(lignes(env, "Articles").length, nbArticles, "articles pas en double");
  // Identifiant mal formé (bricolé) : ignoré, le serveur en crée un
  const r3 = J(c.saveReservation(resa({ idRes: "=1+1", nom: "Bricolé" })));
  assert.match(r3.idRes, /^RES-\d+-[0-9a-f]{4}$/);
  // Plusieurs articles écrits en une fois, à la suite
  c.saveReservation(
    resa({
      nom: "Multi",
      articles: [
        { nom: "A", quantite: 1 },
        { nom: "B", quantite: 2 },
        { nom: "C", quantite: 3 },
      ],
    })
  );
  const idMulti = lignes(env, "Reservations").slice(-1)[0][0];
  assert.deepStrictEqual(
    lignes(env, "Articles")
      .slice(-3)
      .map((x) => [x[1], x[2], x[3]]),
    [
      [idMulti, "A", 1],
      [idMulti, "B", 2],
      [idMulti, "C", 3],
    ]
  );
  assert.ok(
    new Set(lignes(env, "Articles").map((x) => x[0])).size === lignes(env, "Articles").length,
    "ID d'articles uniques"
  );

  // --- Modifier une réservation (client, articles, état) ---
  const idMod = idMulti;
  assert.throws(
    () =>
      c.updateReservation({
        idRes: idMod,
        nom: "Multi",
        prenom: "J",
        telephone: "",
        email: "",
        etat: "Réservé",
      }),
    /téléphone ou un email/
  );
  assert.throws(
    () =>
      c.updateReservation({
        idRes: idMod,
        nom: "Multi",
        prenom: "J",
        telephone: "06",
        email: "",
        etat: "Perdu",
      }),
    /État inconnu/
  );
  assert.throws(
    () =>
      c.updateReservation({
        idRes: idMod,
        nom: "M",
        prenom: "J",
        telephone: "0600000000",
        email: "",
        etat: "Réservé",
        articles: [],
      }),
    /au moins un article/,
    "produits : au moins un article"
  );
  assert.throws(
    () =>
      c.updateReservation({
        idRes: "RES-INCONNUE",
        nom: "M",
        prenom: "J",
        telephone: "06",
        email: "",
        etat: "Réservé",
      }),
    /introuvable/
  );
  const autresArticles = lignes(env, "Articles").filter((x) => x[1] !== idMod);
  const apresMod = J(
    c.updateReservation({
      idRes: idMod,
      nom: "=Multi",
      prenom: "Jeanne",
      telephone: "0611111111",
      email: "j@x.fr",
      etat: "Contacté",
      articles: [
        { nom: "B", quantite: 5 },
        { nom: "D", quantite: 1 },
        { nom: "Zéro", quantite: 0 },
      ],
    })
  );
  const ligneMod = lignes(env, "Reservations").find((x) => x[0] === idMod);
  assert.deepStrictEqual(ligneMod.slice(2, 6), ["=Multi", "Jeanne", "0611111111 / j@x.fr", "Contacté"]);
  assert.deepStrictEqual(
    lignes(env, "Articles")
      .filter((x) => x[1] === idMod)
      .map((x) => [x[2], x[3]]),
    [
      ["B", 5],
      ["D", 1],
    ],
    "anciens articles remplacés, quantité 0 ignorée"
  );
  assert.deepStrictEqual(
    lignes(env, "Articles").filter((x) => x[1] !== idMod),
    autresArticles,
    "articles des autres réservations intacts"
  );
  assert.deepStrictEqual(
    apresMod.reservations[idOp]
      .find((x) => x.idRes === idMod)
      .articles.map(({ nom, quantite }) => ({ nom, quantite })),
    [
      { nom: "B", quantite: 5 },
      { nom: "D", quantite: 1 },
    ],
    "copie à jour renvoyée"
  );
  assert.strictEqual(
    lignes(env, "Reservations")[0][4],
    "0612345678",
    "autres réservations intactes (0 gardé)"
  );

  // --- Supprimer une réservation et ses articles ---
  const nbRes = lignes(env, "Reservations").length;
  const apresSuppr = J(c.deleteReservation(idMod));
  assert.strictEqual(lignes(env, "Reservations").length, nbRes - 1);
  assert.ok(!lignes(env, "Reservations").some((x) => x[0] === idMod));
  assert.ok(!lignes(env, "Articles").some((x) => x[1] === idMod), "ses articles aussi");
  assert.deepStrictEqual(lignes(env, "Articles"), autresArticles);
  assert.ok(!apresSuppr.reservations[idOp].some((x) => x.idRes === idMod));
  assert.throws(() => c.deleteReservation(idMod), /introuvable/);
  assert.strictEqual(env.verrous, 0);

  // --- Changement d'état ---
  const idRes = r[0][0];
  assert.throws(() => c.updateReservationStatus(idRes, "Perdu"), /État inconnu/);
  assert.throws(() => c.updateReservationStatus("RES-INCONNUE", "Retrait"), /introuvable/);
  c.updateReservationStatus(idRes, "Annulé");
  assert.strictEqual(lignes(env, "Reservations")[0][5], "Annulé");
  assert.strictEqual(
    J(c.chargerCopie()).operations[0].count,
    3,
    "annulée retirée du compteur (4 réservations après la suppression, 1 annulée)"
  );
  assert.strictEqual(env.verrous, 0);
  console.log("test_reservations : OK");
} catch (e) {
  console.log("test_reservations : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
