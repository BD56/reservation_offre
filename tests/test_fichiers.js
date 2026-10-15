// Code découpé en plusieurs fichiers. Une seule portée globale côté serveur (tous les .gs)
// et une côté page (tous les <script> des morceaux) :
// - aucun nom déclaré dans deux fichiers (rien ne le signale : le dernier lu gagne) ;
// - serveur : que des déclarations au premier niveau, mêmes constantes quel que soit
//   l'ordre de lecture des .gs ;
// - page : chaque morceau (Style.html, Script*.html) est inclus une fois dans Index.html,
//   existe, et ne contient aucune balise de modèle (inséré tel quel par include_).
const assert = require("assert");
const fs = require("fs"),
  vm = require("vm");
const { fichiersGs, morceauxPage, declarationsServeur, declarationsPage } = require("./declarations");
const repo = process.argv[2];
try {
  // --- Serveur ---
  const fichiers = fichiersGs(repo);
  assert.ok(fichiers.length > 1 && fichiers[0] === "00_Constantes.gs", "00_Constantes.gs lu en premier");
  assert.ok(!fichiers.includes("Code.gs"), "l'ancien Code.gs ne doit plus exister");
  function sansDoublon(declarations) {
    const vus = {};
    for (const [f, noms] of Object.entries(declarations)) {
      for (const n of noms) {
        assert.ok(!vus[n], n + " déclaré dans " + vus[n] + " ET " + f);
        vus[n] = f;
      }
    }
    return vus;
  }
  const vus = sansDoublon(declarationsServeur(repo));
  for (const f of fichiers) {
    fs.readFileSync(repo + "/" + f, "utf8")
      .split("\n")
      .forEach((l, i) => {
        if (/^[^\s/}\])]/.test(l))
          assert.match(
            l,
            /^(function|var|let|const) /,
            f + ":" + (i + 1) + " instruction au premier niveau : " + l
          );
      });
  }
  function valeurs(ordre) {
    const ctx = vm.createContext({});
    for (const f of ordre) vm.runInContext(fs.readFileSync(repo + "/" + f, "utf8"), ctx, { filename: f });
    const r = {};
    for (const n of Object.keys(vus)) {
      const v = vm.runInContext(n, ctx); // const / let : pas des propriétés de l'objet global
      if (typeof v !== "function") r[n] = JSON.stringify(v);
    }
    return r;
  }
  assert.deepStrictEqual(
    valeurs(fichiers.slice().reverse()),
    valeurs(fichiers),
    "mêmes constantes quel que soit l'ordre"
  );
  assert.strictEqual(vus.include_, "Application.gs", "include_ côté serveur");
  // Outils internes : jamais appelables depuis la page (le « _ » final les cache à google.script.run)
  const publiques = Object.keys(vus).filter((n) => {
    const src = fs.readFileSync(repo + "/" + vus[n], "utf8");
    return new RegExp("^function " + n + "\\(", "m").test(src) && !/_$/.test(n);
  });
  assert.deepStrictEqual(
    publiques.sort(),
    [
      "chargerCopie",
      "deleteOperation",
      "deleteReservation",
      "doGet",
      "getOperationDetails",
      "installerDepuisMenu",
      "onOpen",
      "saveOperation",
      "saveReservation",
      "updateOperation",
      "updateReservation",
      "updateReservationStatus",
    ],
    "fonctions appelables depuis la page"
  );

  // --- Page ---
  const index = fs.readFileSync(repo + "/Index.html", "utf8");
  const inclus = [...index.matchAll(/<\?!= include_\('(\w+)'\) \?>/g)].map((m) => m[1] + ".html");
  const morceaux = morceauxPage(repo);
  assert.deepStrictEqual(
    inclus.slice().sort(),
    morceaux,
    "chaque morceau inclus une fois, et rien d'inexistant"
  );
  assert.strictEqual(new Set(inclus).size, inclus.length);
  for (const m of morceaux)
    assert.ok(!/<\?/.test(fs.readFileSync(repo + "/" + m, "utf8")), m + " : pas de balise de modèle");
  const page = sansDoublon(declarationsPage(repo));
  console.log(
    fichiers.length +
      " fichiers serveur (" +
      Object.keys(vus).length +
      " noms), " +
      morceaux.length +
      " morceaux de page (" +
      Object.keys(page).length +
      " noms)"
  );
  console.log("test_fichiers : OK");
} catch (e) {
  console.log("test_fichiers : ÉCHEC " + e.message);
  process.exit(1);
}
