// Réservations côté serveur : contrôles, écriture en texte (0 du téléphone, formules),
// articles, offre supprimée entre-temps, changement d'état.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
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
  assert.strictEqual(c.saveReservation(resa()), true);
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

  // --- Changement d'état ---
  const idRes = r[0][0];
  assert.throws(() => c.updateReservationStatus(idRes, "Perdu"), /État inconnu/);
  assert.throws(() => c.updateReservationStatus("RES-INCONNUE", "Retrait"), /introuvable/);
  c.updateReservationStatus(idRes, "Annulé");
  assert.strictEqual(lignes(env, "Reservations")[0][5], "Annulé");
  assert.strictEqual(c.getOperationsData()[0].count, 1, "annulée retirée du compteur");
  assert.strictEqual(env.verrous, 0);
  console.log("test_reservations : OK");
} catch (e) {
  console.log("test_reservations : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
