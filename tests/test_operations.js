// Offres côté serveur : création (contrôles), liste (compteurs hors annulées), détail,
// modification, suppression en cascade, verrou rendu après chaque écriture.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
const repo = process.argv[2];
try {
  const env = makeEnv({ repo });
  const c = env.ctx;
  const offre = (o) =>
    Object.assign(
      {
        nom: "Foie gras",
        type: "Produit",
        modeSaisie: "Predefini",
        dateDebut: "2026-12-01",
        dateFin: "2026-12-24",
        articlesPredefinis: "Bloc 200g, L'entier",
      },
      o
    );

  // --- Création : contrôles ---
  assert.throws(() => c.saveOperation(offre({ nom: "  " })), /nom de l'offre est obligatoire/);
  assert.throws(
    () => c.saveOperation(offre({ dateDebut: "2026-12-24", dateFin: "2026-12-01" })),
    /date de fin/
  );
  assert.throws(() => c.saveOperation(offre({ articlesPredefinis: " , ," })), /au moins un article/);
  assert.strictEqual(lignes(env, "Operations").length, 0, "rien d'écrit après un refus");

  // --- Création ---
  assert.strictEqual(c.saveOperation(offre()), true);
  c.saveOperation(offre({ nom: "=Soirée", type: "Evenement", modeSaisie: "", articlesPredefinis: "" }));
  const ops = lignes(env, "Operations");
  assert.strictEqual(ops.length, 2);
  assert.match(ops[0][0], /^OP-\d+-[0-9a-f]{4}$/);
  assert.strictEqual(ops[1][1], "=Soirée", "nom commençant par = gardé en texte (pas une formule)");
  assert.ok(ops[0][3] instanceof Date, "date convertie par Sheets");
  assert.strictEqual(env.verrous, 0, "verrou rendu");
  assert.ok(env.flushs >= 2, "écritures envoyées avant de rendre le verrou");

  // --- Liste ---
  const idA = ops[0][0],
    idB = ops[1][0];
  env.sheets.Reservations.appendRow(["RES-1", idA, "A", "a", "'0600000001", "Réservé", "01/12/2026 10:00"]);
  env.sheets.Reservations.appendRow(["RES-2", idA, "B", "b", "'0600000002", "Annulé", "01/12/2026 11:00"]);
  env.sheets.Reservations.appendRow(["RES-3", idA, "C", "c", "'0600000003", "Retrait", "02/12/2026 09:30"]);
  let liste = c.getOperationsData();
  assert.deepStrictEqual(
    liste.map((o) => [o.nom, o.count]),
    [
      ["Foie gras", 2],
      ["=Soirée", 0],
    ],
    "réservations annulées non comptées"
  );
  assert.strictEqual(liste[0].dateDebut, "01/12/2026");
  assert.strictEqual(liste[1].modeSaisie, "Libre", "mode vide -> Libre");
  // Ligne vide au milieu de l'onglet : ignorée
  env.sheets.Operations.getRange(4, 1, 1, 7).setValues([["", "", "", "", "", "", ""]]);
  env.sheets.Operations.getRange(5, 1, 1, 1).setValue("OP-Y");
  assert.deepStrictEqual(
    c.getOperationsData().map((o) => o.id),
    [idA, idB, "OP-Y"]
  );
  env.sheets.Operations.deleteRow(5);
  env.sheets.Operations.deleteRow(4);
  // Date tapée à la main en texte non reconnu : affichée telle quelle, pas de plantage
  env.sheets.Operations.appendRow(["OP-X", "Texte", "Produit", "début décembre", "", "Libre", ""]);
  assert.strictEqual(c.getOperationsData()[2].dateDebut, "début décembre");

  // --- Détail ---
  env.sheets.Articles.appendRow(["ART-1", "RES-1", "Bloc 200g", 2]);
  env.sheets.Articles.appendRow(["ART-2", "RES-2", "Bloc 200g", 5]);
  env.sheets.Articles.appendRow(["ART-3", "RES-2", "L'entier", 1]);
  env.sheets.Articles.appendRow(["ART-4", "RES-AUTRE", "Bloc 200g", 9]);
  // Ancien téléphone écrit comme un nombre (0 perdu) : réaffiché avec son 0
  env.sheets.Reservations.appendRow(["RES-4", idA, "D", "d", "0612345678", "Réservé", "03/12/2026 08:00"]);
  const d = JSON.parse(JSON.stringify(c.getOperationDetails(idA)));
  assert.strictEqual(d.operation.dateDebut, "2026-12-01", "date au format du champ date");
  assert.strictEqual(d.reservations.length, 4);
  assert.deepStrictEqual(d.reservations[1].articles, [
    { nom: "Bloc 200g", quantite: 5 },
    { nom: "L'entier", quantite: 1 },
  ]);
  assert.strictEqual(d.reservations[0].dateSaisie, "01/12/2026 10:00");
  assert.strictEqual(d.reservations[3].contact, "0612345678");
  assert.throws(() => c.getOperationDetails("OP-INCONNU"), /introuvable/);

  // --- Modification ---
  assert.throws(() => c.updateOperation(offre({ id: idA, dateFin: "2026-11-01" })), /date de fin/);
  c.updateOperation(offre({ id: idA, nom: "Foie gras 2026", articlesPredefinis: "Bloc 200g" }));
  liste = c.getOperationsData();
  assert.strictEqual(liste[0].nom, "Foie gras 2026");
  assert.strictEqual(liste[0].articlesPredefinis, "Bloc 200g");
  assert.throws(() => c.updateOperation(offre({ id: "OP-INCONNU" })), /Impossible de trouver/);
  assert.strictEqual(env.verrous, 0, "verrou rendu même après une erreur");

  // --- Suppression en cascade ---
  c.deleteOperation(idA);
  assert.deepStrictEqual(
    lignes(env, "Operations").map((r) => r[0]),
    [idB, "OP-X"]
  );
  assert.deepStrictEqual(lignes(env, "Reservations"), [], "réservations de l'offre supprimées");
  assert.deepStrictEqual(
    lignes(env, "Articles").map((r) => r[0]),
    ["ART-4"],
    "seuls les articles des réservations supprimées partent"
  );
  assert.throws(() => c.deleteOperation(idA), /introuvable/);

  // --- Verrou occupé : message clair, rien d'écrit ---
  const env2 = makeEnv({ repo, verrouOccupe: true });
  assert.throws(() => env2.ctx.saveOperation(offre()), /occupée/);
  assert.strictEqual(lignes(env2, "Operations").length, 0);

  // --- Onglets absents : liste vide plutôt qu'une erreur ---
  const env3 = makeEnv({ repo, sheets: {} });
  assert.deepStrictEqual([...env3.ctx.getOperationsData()], []);
  console.log("test_operations : OK");
} catch (e) {
  console.log("test_operations : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
