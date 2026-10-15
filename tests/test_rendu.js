// La page telle que doGet la produit : morceaux insérés, plus de balise de modèle, scripts
// sans erreur de syntaxe, aucune ressource externe, copie glissée dans la page sans pouvoir
// fermer la balise <script>.
const assert = require("assert");
const vm = require("vm");
const { rendrePage } = require("./harness");
const { makeEnv } = require("./mocks");
const { preparer } = require("./donnees");
const repo = process.argv[2];
try {
  const env = makeEnv({ repo });
  preparer(env); // noms piégeux (<img …>, guillemets, apostrophes)
  env.ctx.saveReservation({
    operationId: env.ids.foie,
    nom: "</script><script>window.__xss=1</script>",
    prenom: "<!--",
    telephone: "0600000000",
    email: "",
    articles: [],
  });
  for (const copieJson of ["null", env.ctx.jsonPourPage_(env.ctx.copie_())]) {
    const rendu = rendrePage(repo, { copieJson });
    assert.ok(!/<\?/.test(rendu), "aucune balise de modèle restante");
    let n = 0;
    for (const m of rendu.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      n++;
      new vm.Script(m[1], { filename: "script " + n });
    }
    assert.strictEqual(n, 6, "scripts de la page (copie + 5 morceaux), aucun ajouté par les données");
    assert.match(rendu, /<style[^>]*>[\s\S]*--accent:/, "style inséré");
    assert.match(rendu, /<symbol id="i-check"/, "icônes insérées");
    assert.doesNotMatch(
      rendu,
      /<(script|link|img)[^>]+(src|href)="https?:/,
      "aucune ressource externe (CDN)"
    );
    const copie = new Function("return " + rendu.match(/const COPIE_INITIALE = (.*);/)[1])();
    if (copieJson !== "null") {
      const noms = copie.reservations[env.ids.foie].map((r) => r.nom);
      assert.ok(noms.includes("</script><script>window.__xss=1</script>"), "nom relu à l'identique");
    } else assert.strictEqual(copie, null);
  }
  console.log("test_rendu : OK");
} catch (e) {
  console.log("test_rendu : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
