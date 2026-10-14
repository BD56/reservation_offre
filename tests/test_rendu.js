// La page telle que doGet la produit : morceaux insérés, plus de balise de modèle,
// scripts sans erreur de syntaxe.
const assert = require("assert");
const vm = require("vm");
const { rendrePage } = require("./harness");
const repo = process.argv[2];
try {
  const rendu = rendrePage(repo, {});
  assert.ok(!/<\?/.test(rendu), "aucune balise de modèle restante");
  let n = 0;
  for (const m of rendu.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    n++;
    new vm.Script(m[1], { filename: "script " + n });
  }
  assert.ok(n >= 4, "scripts de la page présents (" + n + ")");
  assert.match(rendu, /<style[^>]*>[\s\S]*\.card-custom/, "style inséré");
  console.log("test_rendu : OK");
} catch (e) {
  console.log("test_rendu : ÉCHEC " + e.message);
  process.exit(1);
}
